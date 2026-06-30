import re

import dns.exception
import dns.resolver


INVALID_EMAIL_FORMAT_MESSAGE = "Please enter a valid email address."
INVALID_EMAIL_DOMAIN_MESSAGE = "Please use a valid email address with an active mail domain."

EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

_mx_cache: dict[str, bool] = {}


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def is_valid_email_format(email: str) -> bool:
    email = normalize_email(email)
    if email.count("@") != 1:
        return False

    local_part, domain = email.rsplit("@", 1)
    if not local_part or not domain:
        return False
    if "." not in domain or ".." in domain:
        return False
    if not EMAIL_RE.fullmatch(email):
        return False

    labels = domain.split(".")
    if len(labels[-1]) < 2:
        return False
    return all(label and not label.startswith("-") and not label.endswith("-") for label in labels)


def has_valid_mx_domain(email: str) -> bool:
    email = normalize_email(email)
    if not is_valid_email_format(email):
        return False

    domain = email.rsplit("@", 1)[1]
    if domain in _mx_cache:
        return _mx_cache[domain]

    resolver = dns.resolver.Resolver()
    resolver.timeout = 2.0
    resolver.lifetime = 2.0

    try:
        records = resolver.resolve(domain, "MX")
        result = bool(records)
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers, dns.exception.Timeout):
        result = False
    except dns.exception.DNSException:
        result = False

    _mx_cache[domain] = result
    return result


def validate_registration_email(email: str) -> str:
    normalized = normalize_email(email)
    if not is_valid_email_format(normalized):
        raise ValueError(INVALID_EMAIL_FORMAT_MESSAGE)
    if not has_valid_mx_domain(normalized):
        raise ValueError(INVALID_EMAIL_DOMAIN_MESSAGE)
    return normalized
