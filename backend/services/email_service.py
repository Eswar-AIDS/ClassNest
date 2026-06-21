import os
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid


def configuration_error():
    if os.getenv("EMAIL_PROVIDER", "smtp").strip().lower() != "smtp":
        return "Unsupported EMAIL_PROVIDER. Use smtp for this ClassNest version"
    required = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM_EMAIL"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        return f"SMTP is not configured. Missing: {', '.join(missing)}"
    try:
        int(os.environ["SMTP_PORT"])
    except ValueError:
        return "SMTP_PORT must be a valid number"
    return None


def send_email(recipient_email, subject, plain_text, html_body=None):
    """Send one email through SMTP and return (success, error, provider_id)."""
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
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ["SMTP_PORT"]), timeout=20) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls()
                smtp.ehlo()
            if username:
                smtp.login(username, password or "")
            refused = smtp.send_message(message)
            if refused:
                return False, "The SMTP provider rejected the recipient address", None
        return True, None, message.get("Message-ID")
    except (OSError, smtplib.SMTPException) as exc:
        return False, f"Email delivery failed ({type(exc).__name__})", None
