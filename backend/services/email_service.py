import os
import smtplib
import logging
import httpx
from html import escape
from email.message import EmailMessage
from email.utils import make_msgid

logger = logging.getLogger(__name__)


def configuration_error():
    """Check whether the selected email provider is configured."""
    provider = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
    if provider == "resend":
        required = ["RESEND_API_KEY", "SMTP_FROM_EMAIL"]
        missing = [name for name in required if not os.getenv(name)]
        return f"Resend is not configured. Missing: {', '.join(missing)}" if missing else None
    if provider != "smtp":
        return f"Unsupported EMAIL_PROVIDER: {provider}. Use resend or smtp"
    required = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM_EMAIL", "SMTP_PASSWORD"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        return f"SMTP is not configured. Missing: {', '.join(missing)}"
    try:
        int(os.environ["SMTP_PORT"])
    except ValueError:
        return "SMTP_PORT must be a valid number"
    return None


def _log_smtp_debug(recipient_email, exception=None):
    """Log useful SMTP diagnostics without exposing credential values."""
    details = (
        "SMTP_HOST=%s SMTP_PORT=%s SMTP_USERNAME_present=%s "
        "SMTP_PASSWORD_present=%s SMTP_USE_TLS=%s recipient=%s"
    )
    values = (
        os.getenv("SMTP_HOST"), os.getenv("SMTP_PORT"), bool(os.getenv("SMTP_USERNAME")),
        bool(os.getenv("SMTP_PASSWORD")), os.getenv("SMTP_USE_TLS", "true"), recipient_email,
    )
    if exception is None:
        logger.debug(details, *values)
    else:
        logger.error(details + " exception_class=%s exception_message=%s", *values, type(exception).__name__, str(exception))


def _failure(recipient_email, exception, prefix):
    _log_smtp_debug(recipient_email, exception)
    detail = str(exception).strip()
    return False, f"{prefix}: {detail}" if detail else prefix, None


def _from_address():
    from_name = os.getenv("SMTP_FROM_NAME", "ClassNest").strip()
    from_email = os.environ["SMTP_FROM_EMAIL"].strip()
    return f"{from_name} <{from_email}>" if from_name else from_email


def _plain_text_to_html(plain_text):
    escaped_body = escape(plain_text).replace("\r\n", "\n").replace("\r", "\n")
    formatted_body = escaped_body.replace("\n", "<br>")
    return (
        '<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">'
        f"{formatted_body}"
        "</div>"
    )


def _send_resend(recipient_email, subject, plain_text, html_body=None):
    payload = {
        "from": _from_address(),
        "to": [recipient_email],
        "subject": subject,
        "text": plain_text,
        "html": html_body or _plain_text_to_html(plain_text),
    }

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
    except httpx.TimeoutException as exc:
        logger.error("Resend timeout recipient=%s exception_class=%s exception_message=%s", recipient_email, type(exc).__name__, str(exc))
        return False, f"Resend request timed out: {str(exc).strip() or 'request exceeded 20 seconds'}", None
    except httpx.RequestError as exc:
        logger.error("Resend request failed recipient=%s exception_class=%s exception_message=%s", recipient_email, type(exc).__name__, str(exc))
        return False, f"Resend network error: {str(exc).strip() or type(exc).__name__}", None
    except Exception as exc:
        logger.error("Unexpected Resend error recipient=%s exception_class=%s exception_message=%s", recipient_email, type(exc).__name__, str(exc))
        return False, f"Unexpected Resend error: {str(exc).strip() or type(exc).__name__}", None

    if not 200 <= response.status_code < 300:
        response_body = response.text.strip() or "Empty response body"
        error = f"Resend API error ({response.status_code}): {response_body}"
        logger.error("Resend delivery failed recipient=%s status_code=%s response=%s", recipient_email, response.status_code, response_body)
        return False, error, None

    try:
        provider_id = response.json().get("id")
    except ValueError:
        provider_id = None
    logger.debug("Email sent through Resend recipient=%s provider_message_id=%s", recipient_email, provider_id)
    return True, None, provider_id


def _send_smtp(recipient_email, subject, plain_text, html_body=None):

    message = EmailMessage()
    from_email = os.environ["SMTP_FROM_EMAIL"].strip()
    message["From"] = _from_address()
    message["To"] = recipient_email
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    message.set_content(plain_text)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() in {"1", "true", "yes", "on"}
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")

    try:
        _log_smtp_debug(recipient_email)
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"]), timeout=20) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls()
                smtp.ehlo()
            if username:
                smtp.login(username, password or "")
            refused = smtp.send_message(message)
            if refused:
                error_msg = f"SMTP rejected recipient: {recipient_email}"
                logger.warning(error_msg)
                return False, error_msg, None
        logger.debug(f"Email sent successfully to {recipient_email}")
        return True, None, message.get("Message-ID")

    except smtplib.SMTPAuthenticationError as e:
        return _failure(recipient_email, e, "SMTP authentication failed. Check SMTP_USERNAME and SMTP_PASSWORD")
    except smtplib.SMTPConnectError as e:
        return _failure(recipient_email, e, f"Failed to connect to SMTP server {os.getenv('SMTP_HOST')}:{os.getenv('SMTP_PORT')}")
    except smtplib.SMTPRecipientsRefused as e:
        return _failure(recipient_email, e, f"SMTP server refused recipient address: {recipient_email}")
    except smtplib.SMTPServerDisconnected as e:
        return _failure(recipient_email, e, "SMTP server disconnected unexpectedly")
    except TimeoutError as e:
        return _failure(recipient_email, e, "SMTP connection timeout after 20 seconds")
    except OSError as e:
        return _failure(recipient_email, e, "SMTP network error")
    except Exception as e:
        return _failure(recipient_email, e, "Unexpected SMTP error")


def send_email(recipient_email, subject, plain_text, html_body=None):
    """Send one email with the selected provider and return its delivery result."""
    config_error = configuration_error()
    if config_error:
        return False, config_error, None
    if os.getenv("EMAIL_PROVIDER", "smtp").strip().lower() == "resend":
        return _send_resend(recipient_email, subject, plain_text, html_body)
    return _send_smtp(recipient_email, subject, plain_text, html_body)
