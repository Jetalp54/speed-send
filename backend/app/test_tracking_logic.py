
import re
from urllib.parse import quote

# Mocks
campaign_id = 123
base_url = "https://track.example.com"

def test_logic(body_html, recipients):
    print(f"--- Testing with {len(recipients) if recipients else 0} recipients ---")
    
    # 0. Naked Pixel Logic
    naked_pixel_pattern = r'(src=["\']https://[^"\']+/t/pixel\.png)(["\'])'
    
    def add_campaign_param(match):
        params = f"?c={campaign_id}"
        if recipients and len(recipients) == 1:
             params += f"&r={quote(recipients[0])}"
        return f'{match.group(1)}{params}{match.group(2)}'
        
    body_html = re.sub(naked_pixel_pattern, add_campaign_param, body_html)
    print(f"After Naked Pixel: {body_html}")
    
    # 1. Tracking Token Logic
    if '[tracking_pixel]' in body_html:
        pixel_params = f"?c={campaign_id}" if campaign_id else ""
        if recipients and len(recipients) == 1:
            pixel_params += f"&r={quote(recipients[0])}"
        pixel_url = f"{base_url}/t/pixel.png{pixel_params}"
        
        # 1. Handle usage inside src attributes (e.g. <img src="[tracking_pixel]">)
        body_html = body_html.replace('src="[tracking_pixel]"', f'src="{pixel_url}"')
        body_html = body_html.replace("src='[tracking_pixel]'", f"src='{pixel_url}'")
        
        # 2. Handle standalone usage (replace with full <img> tag)
        pixel_tag = f'<img src="{pixel_url}" width="1" height="1" style="display:none;" alt="" />'
        body_html = body_html.replace('[tracking_pixel]', pixel_tag)
        
    print(f"After Token Replace: {body_html}\n")

# Scenarios
# 1. Single Recipient
html1 = '<html><body><img src="https://track.example.com/t/pixel.png"> [tracking_pixel]</body></html>'
recipients1 = ['test@example.com']
print("Scenario 1 (Single):")
test_logic(html1, recipients1)

# 2. Multi Recipient
html2 = '<html><body><img src="https://track.example.com/t/pixel.png"> [tracking_pixel]</body></html>'
recipients2 = ['a@b.com', 'b@c.com']
print("Scenario 2 (Multi):")
test_logic(html2, recipients2)

# 3. No Recipient
html3 = '<html><body>[tracking_pixel]</body></html>'
recipients3 = []
print("Scenario 3 (Empty):")
test_logic(html3, recipients3)

print("SUCCESS: No crashes.")
