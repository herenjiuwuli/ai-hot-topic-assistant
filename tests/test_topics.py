"""接口自动化测试：选题生成接口（/api/topics）
注意：这里只测「不会调用 AI」的参数校验场景，正常生成留到 mock 课时测。
"""
import requests

BASE = "http://localhost:3000"


def test_topics_missing_positioning():
    """定位为空 → 应该返回 400（缺少参数）"""
    r = requests.post(f"{BASE}/api/topics",
                      json={"positioning": "", "platform": "douyin"}, timeout=30)
    assert r.status_code == 400
    assert "error" in r.json()


def test_topics_missing_platform():
    """缺少平台 → 应该返回 400"""
    r = requests.post(f"{BASE}/api/topics",
                      json={"positioning": "二次元手办"}, timeout=30)
    assert r.status_code == 400


def test_topics_invalid_platform():
    """非法平台 → 应该返回 400（参数错误），而不是 503"""
    r = requests.post(f"{BASE}/api/topics",
                      json={"positioning": "二次元手办", "platform": "xxx"}, timeout=30)
    assert r.status_code == 400
