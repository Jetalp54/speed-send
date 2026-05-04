from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import base64
import json
from typing import List, Dict, Optional
from app.config import settings
from app.encryption import encryption_service
import logging


class GoogleWorkspaceService:
    """Service for interacting with Google Workspace APIs"""
    
    def __init__(self, service_account_json: str):
        """
        Initialize with service account JSON (decrypted)
        
        Args:
            service_account_json: JSON string of service account credentials
        """
        self.service_account_info = json.loads(service_account_json)
        self.credentials = None
    
    def get_delegated_credentials(self, user_email: str, scopes: List[str]):
        """
        Get credentials for a specific user via domain-wide delegation
        
        Args:
            user_email: Email of the user to impersonate
            scopes: List of OAuth scopes
        
        Returns:
            Delegated credentials object
        """
        credentials = service_account.Credentials.from_service_account_info(
            self.service_account_info,
            scopes=scopes
        )
        delegated_credentials = credentials.with_subject(user_email)
        return delegated_credentials
    
    def _detect_admin_user(self, user_email: str, user_name: str, first_name: str, last_name: str, user_data: dict, admin_email: str = None) -> bool:
        """
        INTELLIGENT ADMIN DETECTION - Automatically detect admin users during fetch
        
        This function analyzes user data to determine if a user is an admin
        based on multiple criteria including Google Workspace roles and permissions.
        """
        if not user_email:
            return False
        
        email_lower = user_email.lower()
        name_lower = user_name.lower() if user_name else ''
        first_name_lower = first_name.lower() if first_name else ''
        last_name_lower = last_name.lower() if last_name else ''
        
        # 1. Check Google Workspace roles and permissions
        org_unit_path = user_data.get('orgUnitPath', '')
        if org_unit_path and ('admin' in org_unit_path.lower() or 'super' in org_unit_path.lower()):
            return True
        
        # 2. Check if user has admin privileges (Google Workspace specific)
        is_admin = user_data.get('isAdmin', False)
        is_delegated_admin = user_data.get('isDelegatedAdmin', False)
        if is_admin or is_delegated_admin:
            return True
        
        # 3. Check for admin email patterns
        admin_email_patterns = [
            'admin', 'administrator', 'postmaster', 'abuse', 'support',
            'noreply', 'no-reply', 'donotreply', 'do-not-reply',
            'system', 'automation', 'bot', 'nobot', 'no-bot',
            'test', 'testing', 'demo', 'sample'
        ]
        
        local_part = email_lower.split('@')[0]
        for pattern in admin_email_patterns:
            if (local_part == pattern or 
                local_part.startswith(pattern + '.') or 
                local_part.startswith(pattern + '_')):
                return True
        
        # 4. Check for admin name patterns
        admin_name_patterns = [
            'admin', 'administrator', 'postmaster', 'abuse', 'support',
            'system', 'automation', 'bot', 'test', 'demo', 'sample'
        ]
        
        for pattern in admin_name_patterns:
            if (pattern in name_lower or 
                pattern in first_name_lower or 
                pattern in last_name_lower):
                return True
        
        # 5. Check if user is the one used for delegation (admin_email)
        if admin_email and email_lower == admin_email.lower():
            return True
        
        # 6. Check for common admin indicators in user data
        user_notes = user_data.get('notes', '')
        if user_notes and any(keyword in user_notes.lower() for keyword in ['admin', 'administrator', 'super user']):
            return True
        
        # 7. Check for specific admin roles in custom attributes
        custom_attributes = user_data.get('customSchemas', {})
        for schema in custom_attributes.values():
            if isinstance(schema, dict):
                for value in schema.values():
                    if isinstance(value, str) and any(keyword in value.lower() for keyword in ['admin', 'administrator', 'super']):
                        return True
        
        return False
    
    def fetch_workspace_users(self, admin_email: str = None) -> List[Dict]:
        """
        Fetch all users from Google Workspace domain
        
        Args:
            admin_email: Email of an admin user for delegation (optional, will auto-detect from JSON)
        
        Returns:
            List of user dictionaries
        """
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            # Auto-detect admin email from service account if not provided
            if not admin_email:
                # Try to extract from service account JSON
                client_email = self.service_account_info.get('client_email', '')
                if '@' in client_email:
                    # Extract domain and create admin email
                    domain = client_email.split('@')[1]
                    # Try common admin emails
                    possible_admins = [
                        f'admin@{domain}',
                        f'administrator@{domain}',
                        f'postmaster@{domain}'
                    ]
                    admin_email = possible_admins[0]
                else:
                    raise Exception("Admin email is required and could not be auto-detected")
            
            logger.info(f"🔐 Fetching users with admin email: {admin_email}")
            logger.info(f"📋 Using scopes: {settings.ADMIN_SCOPES}")
            logger.info(f"🔑 Service account: {self.service_account_info.get('client_email')}")
            
            # Check if service account has required fields
            required_fields = ['client_email', 'private_key', 'token_uri']
            missing_fields = [field for field in required_fields if not self.service_account_info.get(field)]
            if missing_fields:
                raise Exception(f"Service account JSON missing required fields: {missing_fields}")
            
            credentials = self.get_delegated_credentials(admin_email, settings.ADMIN_SCOPES)
            
            logger.info("✅ Credentials created successfully")
            
            service = build('admin', 'directory_v1', credentials=credentials)
            
            logger.info("🌐 Admin Directory service built, requesting users...")
            
            # First, try to get domain info to verify access
            try:
                domain_info = service.domains().list(customer='my_customer').execute()
                logger.info(f"🌐 Domain info: {domain_info}")
            except Exception as e:
                logger.warning(f"⚠️ Could not fetch domain info: {e}")
            
            users = []
            page_token = None
            
            while True:
                try:
                    results = service.users().list(
                        customer='my_customer',
                        maxResults=500,
                        orderBy='email',
                        pageToken=page_token
                    ).execute()
                    
                    logger.info(f"📊 API Response: {results}")
                    users.extend(results.get('users', []))
                    page_token = results.get('nextPageToken')
                    
                    if not page_token:
                        break
                        
                except HttpError as e:
                    logger.error(f"❌ Google API Error: {e}")
                    logger.error(f"Status: {e.resp.status if hasattr(e, 'resp') else 'N/A'}")
                    logger.error(f"Content: {e.content if hasattr(e, 'content') else 'N/A'}")
                    raise Exception(f"Google API Error: {e}")
            
            logger.info(f"✅ Successfully fetched {len(users)} users from Google Workspace")
            
            # Parse user data with intelligent admin detection
            parsed_users = []
            admin_users = []
            
            for user in users:
                user_email = user.get('primaryEmail')
                user_name = user.get('name', {}).get('fullName', '')
                first_name = user.get('name', {}).get('givenName', '')
                last_name = user.get('name', {}).get('familyName', '')
                
                # INTELLIGENT ADMIN DETECTION
                is_admin = self._detect_admin_user(user_email, user_name, first_name, last_name, user, admin_email)
                
                if is_admin:
                    admin_users.append(user_email)
                    logger.info(f"🚫 ADMIN DETECTED: {user_email} (excluded from senders)")
                    continue  # Skip admin users
                
                parsed_users.append({
                    'email': user_email,
                    'full_name': user_name,
                    'first_name': first_name,
                    'last_name': last_name,
                    'is_active': not user.get('suspended', False)
                })
            
            logger.info(f"📊 Parsed {len(parsed_users)} user records")
            logger.info(f"🚫 Excluded {len(admin_users)} admin users: {admin_users}")
            
            return parsed_users
        
        except HttpError as error:
            logger.error(f"❌ Google API HttpError: {error}")
            logger.error(f"Error details: {error.resp.status if hasattr(error, 'resp') else 'N/A'}")
            logger.error(f"Error content: {error.content if hasattr(error, 'content') else 'N/A'}")
            raise Exception(f"Failed to fetch users: {error}")
        except Exception as e:
            logger.error(f"❌ Unexpected error: {str(e)}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
    
    def send_email(
        self,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body_html: Optional[str] = None,
        body_plain: Optional[str] = None,
        from_name: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        attachments: Optional[List[Dict]] = None
    ) -> str:
        """
        Send an email using Gmail API
        
        Args:
            sender_email: Email address to send from (will be impersonated)
            recipient_email: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_plain: Plain text body content
            custom_headers: Dictionary of custom headers
            attachments: List of attachment dictionaries
        
        Returns:
            Message ID of sent email
        """
        try:
            credentials = self.get_delegated_credentials(sender_email, settings.GMAIL_SCOPES)
            service = build('gmail', 'v1', credentials=credentials)
            # Quick pre-check: ensure Gmail is enabled for user
            try:
                service.users().getProfile(userId='me').execute()
            except HttpError as precheck:
                # Translate common failure clearly
                if hasattr(precheck, 'content') and b'Mail service not enabled' in getattr(precheck, 'content', b''):
                    raise Exception("Gmail is not enabled for this user. Enable Gmail for the account or choose another sender.")
                raise
            
            # Create message (normalize bodies to strings)
            if body_html is not None and not isinstance(body_html, str):
                try:
                    if isinstance(body_html, list):
                        body_html = "\n".join([str(x) for x in body_html])
                    else:
                        import json as _json
                        body_html = _json.dumps(body_html)
                except Exception:
                    body_html = str(body_html)
            if body_plain is not None and not isinstance(body_plain, str):
                try:
                    if isinstance(body_plain, list):
                        body_plain = "\n".join([str(x) for x in body_plain])
                    else:
                        import json as _json
                        body_plain = _json.dumps(body_plain)
                except Exception:
                    body_plain = str(body_plain)

            # Create message
            if body_html and body_plain:
                message = MIMEMultipart('alternative')
                part1 = MIMEText(body_plain, 'plain', 'utf-8')
                part2 = MIMEText(body_html, 'html', 'utf-8')
                message.attach(part1)
                message.attach(part2)
            elif body_html:
                # HTML-only: Create multipart to ensure proper Content-Type
                message = MIMEMultipart('alternative')
                # Add plain text fallback
                plain_part = MIMEText("This email contains HTML content.", 'plain', 'utf-8')
                html_part = MIMEText(body_html, 'html', 'utf-8')
                message.attach(plain_part)
                message.attach(html_part)
            else:
                message = MIMEText(body_plain or '', 'plain', 'utf-8')
            
            message['To'] = recipient_email
            # Force display name if provided, otherwise default to raw email
            forced_from = f"{from_name} <{sender_email}>" if from_name else sender_email
            message['From'] = forced_from
            # Reinforce for providers that ignore From display name
            message['Sender'] = forced_from
            message['Reply-To'] = forced_from
            message['Subject'] = subject
            
            # Add custom headers
            if custom_headers:
                for key, value in custom_headers.items():
                    message[key] = value
            
            # Add attachments (if provided)
            if attachments:
                # Convert to multipart if not already
                if not isinstance(message, MIMEMultipart):
                    old_message = message
                    message = MIMEMultipart()
                    message['To'] = recipient_email
                    message['From'] = sender_email
                    message['Subject'] = subject
                    message.attach(old_message)
                
                for attachment in attachments:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(base64.b64decode(attachment['content']))
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename={attachment["filename"]}'
                    )
                    message.attach(part)
            
            # Encode and send
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
            send_message = {'raw': raw_message}
            
            result = service.users().messages().send(
                userId='me',
                body=send_message
            ).execute()
            
            return result['id']
        
        except HttpError as error:
            raise Exception(f"Failed to send email: {error}")

    def is_gmail_enabled(self, sender_email: str) -> bool:
        """Return True if Gmail is enabled for the delegated user, else False."""
        try:
            credentials = self.get_delegated_credentials(sender_email, settings.GMAIL_SCOPES)
            service = build('gmail', 'v1', credentials=credentials)
            service.users().getProfile(userId='me').execute()
            return True
        except HttpError as e:
            if hasattr(e, 'content') and b'Mail service not enabled' in getattr(e, 'content', b''):
                return False
            # Other auth errors also treated as not enabled for safety
            return False
    
    def send_email_with_custom_headers(
        self,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body_html: Optional[str] = None,
        body_plain: Optional[str] = None,
        from_name: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        attachments: Optional[List[Dict]] = None
    ) -> str:
        """
        Send an email with full custom header control using raw email construction
        
        Args:
            sender_email: Email address to send from (will be impersonated)
            recipient_email: Recipient email address
            subject: Email subject
            body_html: HTML body content
            body_plain: Plain text body content
            from_name: Sender name
            custom_headers: Dictionary of custom headers (overrides all headers)
            attachments: List of attachment dictionaries
        
        Returns:
            Message ID of sent email
        """
        try:
            credentials = self.get_delegated_credentials(sender_email, settings.GMAIL_SCOPES)
            service = build('gmail', 'v1', credentials=credentials)
            # Pre-check Gmail enabled
            try:
                service.users().getProfile(userId='me').execute()
            except HttpError as precheck:
                if hasattr(precheck, 'content') and b'Mail service not enabled' in getattr(precheck, 'content', b''):
                    raise Exception("Gmail is not enabled for this user. Enable Gmail for the account or choose another sender.")
                raise
            
            # Build raw email with custom headers
            raw_email = self._build_raw_email_with_headers(
                sender_email=sender_email,
                recipient_email=recipient_email,
                subject=subject,
                body_html=body_html,
                body_plain=body_plain,
                from_name=from_name,
                custom_headers=custom_headers,
                attachments=attachments
            )
            
            # Debug: Log the raw email headers
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"🔍 RAW EMAIL HEADERS:")
            logger.info(f"📧 Raw email preview: {raw_email[:500]}...")
            if custom_headers:
                logger.info(f"🎯 Custom headers being sent: {custom_headers}")
            
            # Encode and send
            raw_message = base64.urlsafe_b64encode(raw_email.encode()).decode()
            send_message = {
                'raw': raw_message
            }
            # Use send() so the email is actually delivered
            result = service.users().messages().send(
                userId='me',
                body=send_message
            ).execute()
            
            return result['id']
        
        except HttpError as error:
            raise Exception(f"Failed to send email: {error}")
    
    def _build_raw_email_with_headers(
        self,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body_html: Optional[str] = None,
        body_plain: Optional[str] = None,
        from_name: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        attachments: Optional[List[Dict]] = None
    ) -> str:
        """
        Build raw email with full custom header control - completely manual construction
        """
        import base64
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.base import MIMEBase
        from email import encoders
        
        # Normalize bodies to strings
        if body_html is not None and not isinstance(body_html, str):
            try:
                if isinstance(body_html, list):
                    body_html = "\n".join([str(x) for x in body_html])
                else:
                    import json as _json
                    body_html = _json.dumps(body_html)
            except Exception:
                body_html = str(body_html)
        if body_plain is not None and not isinstance(body_plain, str):
            try:
                if isinstance(body_plain, list):
                    body_plain = "\n".join([str(x) for x in body_plain])
                else:
                    import json as _json
                    body_plain = _json.dumps(body_plain)
            except Exception:
                body_plain = str(body_plain)

        # Build message with proper HTML/plain text handling
        # Always prefer HTML if available, ensure Content-Type is set correctly
        # IMPORTANT: Normalize and validate body content
        body_html = body_html or ""  # Ensure not None
        body_plain = body_plain or ""  # Ensure not None
        
        logger = logging.getLogger(__name__)
        logger.info(f"📧 Building email - body_html length: {len(body_html) if body_html else 0}, body_plain length: {len(body_plain) if body_plain else 0}")
        
        # Build message with body content FIRST (this is critical!)
        # CRITICAL: Check for non-empty strings (strip whitespace to handle empty HTML)
        body_html_has_content = body_html and body_html.strip()
        body_plain_has_content = body_plain and body_plain.strip()
        
        if body_html_has_content and body_plain_has_content:
            message = MIMEMultipart('alternative')
            part1 = MIMEText(body_plain, 'plain', 'utf-8')
            part2 = MIMEText(body_html, 'html', 'utf-8')
            message.attach(part1)
            message.attach(part2)
            logger.info(f"📧 Attached both plain ({len(body_plain)} chars) and HTML ({len(body_html)} chars) parts")
        elif body_html_has_content:
            # HTML-only: Create multipart to ensure proper Content-Type
            message = MIMEMultipart('alternative')
            # Add plain text fallback
            plain_part = MIMEText("This email contains HTML content.", 'plain', 'utf-8')
            html_part = MIMEText(body_html, 'html', 'utf-8')
            message.attach(plain_part)
            message.attach(html_part)
            logger.info(f"📧 Attached HTML-only part ({len(body_html)} chars)")
        elif body_plain_has_content:
            message = MIMEText(body_plain, 'plain', 'utf-8')
            logger.info(f"📧 Created plain text only part ({len(body_plain)} chars)")
        else:
            # No body content - this should not happen, but create empty plain text as fallback
            logger.warning(f"⚠️ WARNING: No body content provided! body_html='{body_html[:100] if body_html else 'None'}...', body_plain='{body_plain[:100] if body_plain else 'None'}...'")
            message = MIMEText("", 'plain', 'utf-8')
            logger.info(f"📧 Created empty plain text part (fallback)")
        
        # Combine custom headers with essential headers
        # Essential headers (From, To, Subject) are set first, then overridden by custom_headers if present
        
        final_headers = {}

        # 1. Set essential headers
        final_headers['To'] = recipient_email
        final_headers['From'] = f"{from_name} <{sender_email}>" if from_name else sender_email
        final_headers['Subject'] = subject

        # 2. Override with custom headers (case-insensitive key matching)
        if custom_headers:
            # Create a case-insensitive mapping of final_headers
            final_headers_lower = {k.lower(): k for k in final_headers}
            
            for key, value in custom_headers.items():
                key_lower = key.lower()
                
                # CRITICAL: Do not allow custom headers to override MIME structural headers
                if key_lower in ['content-type', 'mime-version', 'content-transfer-encoding']:
                    logger.warning(f"⚠️ Skipping forbidden custom header: {key}")
                    continue

                # Check if this custom header should override an essential header
                if key_lower in final_headers_lower:
                    original_key = final_headers_lower[key_lower]
                    final_headers[original_key] = value if isinstance(value, str) else str(value)
                else:
                    # Add as a new header
                    final_headers[key] = value if isinstance(value, str) else str(value)

        # 3. Apply the final headers to the message object
        for key, value in final_headers.items():
            # The 'message' object handles header encoding, so we can set them directly
            message[key] = value

        
        # Handle attachments
        if attachments:
            if not isinstance(message, MIMEMultipart):
                old_message = message
                message = MIMEMultipart()
                # Copy headers from old message
                for key, value in old_message.items():
                    message[key] = value
                message.attach(old_message)
            
            for attachment in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(base64.b64decode(attachment['content']))
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={attachment["filename"]}'
                )
                message.attach(part)
        
        # Debug: Log the final raw email
        raw_email = message.as_string()
        logger.info(f"🔍 FINAL RAW EMAIL:")
        logger.info(f"📧 Raw email length: {len(raw_email)} characters")
        logger.info(f"📧 Raw email preview (first 500 chars): {raw_email[:500]}...")
        # Check if body content is present
        if isinstance(message, MIMEMultipart):
            logger.info(f"📧 MIMEMultipart - payload count: {len(message._payload) if hasattr(message, '_payload') else 'N/A'}")
            if hasattr(message, '_payload') and message._payload:
                for i, part in enumerate(message._payload):
                    payload = part.get_payload(decode=False) if hasattr(part, 'get_payload') else 'N/A'
                    logger.info(f"📧 Part {i} type: {part.get_content_type() if hasattr(part, 'get_content_type') else 'N/A'}, payload length: {len(payload) if payload else 0}")
        else:
            payload = message.get_payload(decode=False) if hasattr(message, 'get_payload') else 'N/A'
            logger.info(f"📧 Single part - payload length: {len(payload) if payload else 0}")
        
        return raw_email
    
    def test_connection(self, admin_email: str) -> bool:
        """
        Test if the service account can connect and fetch users
        
        Args:
            admin_email: Email of an admin user
        
        Returns:
            True if connection successful
        """
        try:
            users = self.fetch_workspace_users(admin_email)
            return len(users) > 0
        except Exception:
            return False


def substitute_variables(text: str, variables: Dict[str, str]) -> str:
    """
    Replace {{variable}} placeholders with actual values
    
    Args:
        text: Text containing {{variable}} placeholders
        variables: Dictionary of variable names to values
    
    Returns:
        Text with substituted values
    """
    result = text
    for key, value in variables.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def process_custom_header_tags(header_text: str, recipient_email: str, sender_name: str, subject: str, smtp_username: str, domain: str = None) -> str:
    """
    Process custom header tags like [to], [from], [subject], [date], [smtp], [domain], [rndn_N], [rnda_N]
    
    Args:
        header_text: Custom header text with tags
        recipient_email: Recipient email address
        sender_name: Sender name
        subject: Email subject
        smtp_username: SMTP username
        domain: Sender domain (optional)
    
    Returns:
        Processed header text with tags replaced
    """
    import re
    import random
    import string
    from datetime import datetime
    
    result = header_text
    
    # Basic tags
    result = result.replace('[to]', recipient_email)
    result = result.replace('[from]', sender_name)
    result = result.replace('[subject]', subject)
    result = result.replace('[smtp]', smtp_username)
    result = result.replace('[date]', datetime.now().strftime('%a, %d %b %Y %H:%M:%S %z'))
    
    # Domain tag
    if domain:
        result = result.replace('[domain]', domain)
    else:
        # Extract domain from smtp_username if not provided
        if '@' in smtp_username:
            domain = smtp_username.split('@')[1]
            result = result.replace('[domain]', domain)
    
    # Random number tags [rndn_N] - N digits
    rndn_pattern = r'\[rndn_(\d+)\]'
    def replace_rndn(match):
        length = int(match.group(1))
        return ''.join(random.choices('0123456789', k=length))
    result = re.sub(rndn_pattern, replace_rndn, result)
    
    # Random alphanumeric tags [rnda_N] - N characters (A-Z, a-z, 0-9)
    rnda_pattern = r'\[rnda_(\d+)\]'
    def replace_rnda(match):
        length = int(match.group(1))
        chars = string.ascii_letters + string.digits
        return ''.join(random.choices(chars, k=length))
    result = re.sub(rnda_pattern, replace_rnda, result)
    
    return result

