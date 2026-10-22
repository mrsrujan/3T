import time
from app.services.cache import InMemoryCache


def test_set_and_get():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=60)
    assert c.get("k") == "v"


def test_miss_returns_none():
    c = InMemoryCache()
    assert c.get("missing") is None


def test_expired_returns_none():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=0)
    time.sleep(0.01)
    assert c.get("k") is None


def test_invalidate():
    c = InMemoryCache()
    c.set("k", "v", ttl_seconds=60)
    c.invalidate("k")
    assert c.get("k") is None


def test_overwrite():
    c = InMemoryCache()
    c.set("k", "a", ttl_seconds=60)
    c.set("k", "b", ttl_seconds=60)
    assert c.get("k") == "b"
