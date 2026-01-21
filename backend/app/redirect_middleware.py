from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import URL

class RelativeRedirectMiddleware(BaseHTTPMiddleware):
    """Convert absolute redirects to relative redirects to fix Nginx proxy issues"""
    
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # If it's a redirect with a Location header
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get('location')
            if location:
                # Convert absolute URL to relative path
                url = URL(location)
                if url.hostname:
                    # Keep only the path and query
                    relative_location = str(url.path)
                    if url.query:
                        relative_location += f"?{url.query}"
                    
                    # Update the location header
                    response.headers['location'] = relative_location
        
        return response
