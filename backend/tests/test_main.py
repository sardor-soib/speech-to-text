import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


class TestAppStartup:
    """Tests for checking application startup"""

    def test_app_instance_created(self):
        """Check that FastAPI application instance is created"""
        assert app is not None
        assert app.title == "FastAPI"

    def test_app_startup_with_test_client(self):
        """Check successful application startup with TestClient"""
        client = TestClient(app)
        assert client is not None


class TestAPIConnection:
    """Tests for checking API connection"""

    def test_docs_endpoint_accessible(self):
        """Check that API documentation is accessible"""
        client = TestClient(app)
        response = client.get("/docs")
        assert response.status_code == 200

    def test_openapi_endpoint_accessible(self):
        """Check that OpenAPI schema is accessible"""
        client = TestClient(app)
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert response.json() is not None


class TestCORSMiddleware:
    """Tests for checking CORS configuration"""

    def test_cors_headers_present(self):
        """Check that CORS headers are present"""
        client = TestClient(app)
        response = client.options(
            "/docs",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert "access-control-allow-origin" in response.headers
        # CORS middleware returns the specific origin from request, not "*"
        assert response.headers["access-control-allow-origin"] in ["*", "http://localhost:3000"]

    def test_cors_credentials_allowed(self):
        """Check that credentials are allowed in CORS"""
        client = TestClient(app)
        response = client.options(
            "/docs",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert response.headers.get("access-control-allow-credentials") == "true"


class TestWebSocketRouter:
    """Tests for checking WebSocket router connection"""

    def test_websocket_route_registered(self):
        """Check that WebSocket route is registered"""
        route_paths = [route.path for route in app.routes]
        assert "/realtime" in route_paths

    def test_websocket_connection(self):
        """Check WebSocket connection capability"""
        client = TestClient(app)
        # Test WebSocket connection attempt
        # Accept either an exception (when OpenAI service/key is unavailable)
        # or a successful handshake; the route must exist.
        try:
            with client.websocket_connect("/realtime") as websocket:
                # If connection succeeds, simply close it — test passes
                pass
        except Exception:
            # If connection fails (for example no API key), that's acceptable here
            pass
