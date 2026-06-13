from decimal import Decimal

def calculate_broker_commission(amount):
    """
    Calculate NEPSE Broker Commission based on transaction amount.
    Rates effective from May 14, 2024.
    """
    amount = Decimal(str(amount))
    
    if amount <= 50000:
        rate = Decimal('0.36')
    elif amount <= 500000:
        rate = Decimal('0.33')
    elif amount <= 2000000:
        rate = Decimal('0.31')
    elif amount <= 10000000:
        rate = Decimal('0.27')
    else:
        rate = Decimal('0.24')
        
    commission = amount * (rate / 100)
    
    # Minimum commission is usually Rs 10, but not explicitly stated in recent rules as strict minimum per txn,
    # often applied per contract. We'll use strict percentage for now or minimal 10 if standard practice.
    # Let's stick to percentage as per recent directive.
    return round(commission, 2)

def calculate_sebon_fee(amount):
    """
    SEBON Regulatory Fee: 0.015% of transaction amount.
    """
    amount = Decimal(str(amount))
    return round(amount * Decimal('0.00015'), 2)

def calculate_dp_charge():
    """
    DP Charge: Flat Rs 25 per transaction (per script/day).
    """
    return Decimal('25.00')

def calculate_cgt(profit, is_long_term=False):
    """
    Capital Gains Tax (CGT) on profit.
    Short Term (< 1 year): 7.5%
    Long Term (>= 1 year): 5%
    """
    if profit <= 0:
        return Decimal('0.00')
        
    profit = Decimal(str(profit))
    rate = Decimal('0.05') if is_long_term else Decimal('0.075')
    return round(profit * rate, 2)


import re

_FISCAL_YEAR_RE = re.compile(r'(\d{2,4})\s*[/-]\s*(\d{2,4})')

def normalize_fiscal_year(value):
    """
    Normalize Nepali fiscal year strings to the canonical '0XX-0XX' form.

    Seeds and scrapers write mixed formats ('2081/82', '082/083', '072-073');
    fiscal_year is a CharField ordered lexically, so mixed formats break every
    "latest report" query. '2081/82' -> '081-082'.
    Unparseable values pass through unchanged.
    """
    if not value:
        return value
    match = _FISCAL_YEAR_RE.search(str(value))
    if not match:
        return value
    first, second = match.group(1), match.group(2)
    first = first[-3:].zfill(3)
    second = second[-3:]
    if len(second) == 2:
        second = first[0] + second
    return f"{first}-{second.zfill(3)}"
