# TEMPLATE ENGINE - Advanced Tag Processing System
# Supports custom headers, random generation, and system tags

import random
import string
import re
from datetime import datetime
from typing import Dict, Any
import uuid

class TemplateEngine:
    """
    Process email templates with custom tags.
    
    Supported Tags:
    - Random Generation: [rndn_N], [rnda_N], [rndl_N], [rndu_N], [rnds_N], [rndlu_N], [rndln_N], [rndun_N]
    - System Tags: [smtp], [from], [subject], [to], [date], [Message-ID]
    """
    
    # Character sets for random generation
    DIGITS = string.digits  # 0-9
    LOWERCASE = string.ascii_lowercase  # a-z
    UPPERCASE = string.ascii_uppercase  # A-Z
    LETTERS = string.ascii_letters  # A-Z a-z
    ALPHANUMERIC = string.ascii_letters + string.digits  # A-Z a-z 0-9
    SYMBOLS = '*-_#@!$%&+=?'  # Special symbols
    
    @staticmethod
    def generate_random_string(tag_type: str, length: int) -> str:
        """
        Generate random string based on tag type.
        
        Args:
            tag_type: Type of random string (rndn, rnda, rndl, rndu, rnds, rndlu, rndln, rndun)
            length: Length of string to generate
        
        Returns:
            Random string of specified length and type
        """
        charset_map = {
            'rndn': TemplateEngine.DIGITS,  # 0-9
            'rnda': TemplateEngine.ALPHANUMERIC,  # A-Z a-z 0-9
            'rndl': TemplateEngine.LOWERCASE,  # a-z
            'rndu': TemplateEngine.UPPERCASE,  # A-Z
            'rnds': TemplateEngine.SYMBOLS,  # *-_#...
            'rndlu': TemplateEngine.LETTERS,  # A-Z a-z
            'rndln': TemplateEngine.LOWERCASE + TemplateEngine.DIGITS,  # a-z 0-9
            'rndun': TemplateEngine.UPPERCASE + TemplateEngine.DIGITS,  # A-Z 0-9
        }
        
        charset = charset_map.get(tag_type)
        if not charset:
            return f"[INVALID_TAG:{tag_type}]"
        
        return ''.join(random.choice(charset) for _ in range(length))
    
    @staticmethod
    def generate_message_id(domain: str = "localhost") -> str:
        """Generate unique Message-ID"""
        unique_id = uuid.uuid4().hex
        timestamp = int(datetime.utcnow().timestamp())
        return f"<{timestamp}-{unique_id}@{domain}>"
    
    @staticmethod
    def process_template(template: str, context: Dict[str, Any]) -> str:
        """
        Process template string, replacing all tags with actual values.
        
        Args:
            template: Template string with tags
            context: Dictionary with replacement values
                - smtp: SMTP username (email)
                - from: From name
                - subject: Email subject
                - to: Recipient email
                - date: Date string (or None for auto-generate)
                - domain: Domain for Message-ID generation
        
        Returns:
            Processed template with all tags replaced
        """
        if not template:
            return ""
        
        result = template
        
        # 1. Process random generation tags [tagtype_N]
        # Pattern: [rndn_10], [rnda_5], etc.
        random_tag_pattern = r'\[(rndn|rnda|rndl|rndu|rnds|rndlu|rndln|rndun)_(\d+)\]'
        
        def replace_random_tag(match):
            tag_type = match.group(1)
            length = int(match.group(2))
            # Limit length to prevent abuse
            length = min(length, 256)
            return TemplateEngine.generate_random_string(tag_type, length)
        
        result = re.sub(random_tag_pattern, replace_random_tag, result)
        
        # 2. Process system tags
        system_replacements = {
            '[smtp]': context.get('smtp', ''),
            '[from]': context.get('from', ''),
            '[subject]': context.get('subject', ''),
            '[to]': context.get('to', ''),
            '[date]': context.get('date') or datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S +0000'),
            '[Message-ID]': TemplateEngine.generate_message_id(context.get('domain', 'localhost')),
        }
        
        for tag, value in system_replacements.items():
            result = result.replace(tag, str(value))
        
        return result
    
    @staticmethod
    def validate_template(template: str) -> tuple:
        """
        Validate template for syntax errors.
        
        Returns:
            (is_valid, error_message)
        """
        if not template:
            return (True, None)
        
        # Check for unclosed tags
        all_tags = re.findall(r'\[([^\]]+)\]', template)
        
        for tag in all_tags:
            # Check random generation tags
            if tag.startswith(('rndn_', 'rnda_', 'rndl_', 'rndu_', 'rnds_', 'rndlu_', 'rndln_', 'rndun_')):
                parts = tag.split('_')
                if len(parts) != 2:
                    return (False, f"Invalid random tag format: [{tag}]")
                try:
                    length = int(parts[1])
                    if length < 1 or length > 256:
                        return (False, f"Random tag length must be 1-256: [{tag}]")
                except ValueError:
                    return (False, f"Invalid length in random tag: [{tag}]")
            
            # Check if it's a valid system tag
            elif tag not in ['smtp', 'from', 'subject', 'to', 'date', 'Message-ID']:
                # Unknown tag - warn but don't fail
                pass
        
        return (True, None)
    
    @staticmethod
    def get_default_headers() -> str:
        """Return default email headers template"""
        return """MIME-version: 1.0
Content-type: text/html
To: [to]
from: [from] <[smtp]>
Subject: [subject]
Date: [date]
Message-ID: [Message-ID]"""
    
    @staticmethod
    def preview_template(template: str, sample_context: Dict[str, Any] = None) -> str:
        """
        Preview template with sample data.
        
        Args:
            template: Template string
            sample_context: Optional sample context, defaults to example data
        
        Returns:
            Rendered preview
        """
        if sample_context is None:
            sample_context = {
                'smtp': 'user@example.com',
                'from': 'John Doe',
                'subject': 'Test Subject',
                'to': 'recipient@example.com',
                'domain': 'example.com'
            }
        
        return TemplateEngine.process_template(template, sample_context)
