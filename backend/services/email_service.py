import os
import smtplib
import logging
from email.message import EmailMessage
from email.utils import make_msgid

logger = logging.getLogger(__name__)


def configuration_error():
    """Check if SMTP is properly configured. Returns error message or None."""
    if os.getenv("EMAIL_PROVIDER", "smtp").strip().lower() != "smtp":
        return "Unsupported EMAIL_PROVIDER. Use smtp for this ClassNest version"
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


def send_email(recipient_email, subject, plain_text, html_body=None):
    """Send one email through SMTP and return (success, error_message, provider_id)."""
    config_error = configuration_error()
    if config_error:
        return False, config_error, None

    message = EmailMessage()
    from_name = os.getenv("SMTP_FROM_NAME", "ClassNest").strip()
    from_email = os.environ["SMTP_FROM_EMAIL"].strip()
    message["From"] = f"{from_name} <{from_email}>" if from_name else from_email
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
