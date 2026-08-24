"""接口自动化测试：复盘记录接口（/api/reviews）"""
import requests

BASE = "http://localhost:3000"


def _cleanup(rid):
    """清理：删除测试创建的数据，不污染真实复盘记录"""
    if rid:
        requests.delete(f"{BASE}/api/reviews/{rid}", timeout=10)


def test_reviews_missing_title():
    """缺 title → 应该返回 400"""
    r = requests.post(f"{BASE}/api/reviews",
                      json={"platform": "douyin"}, timeout=10)
    assert r.status_code == 400
    assert "error" in r.json()


def test_reviews_missing_platform():
    """缺 platform → 应该返回 400"""
    r = requests.post(f"{BASE}/api/reviews",
                      json={"title": "测试选题"}, timeout=10)
    assert r.status_code == 400


def test_reviews_normal():
    """正常创建 → 200，views 默认 0，有 id"""
    r = requests.post(f"{BASE}/api/reviews",
                      json={"title": "测试选题-自动化", "platform": "douyin"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["views"] == 0   # 规定：views 可选，默认 0
    assert data["likes"] == 0
    assert data["id"]           # 有 id 说明创建成功
    _cleanup(data["id"])        # 清理测试数据


def test_reviews_long_title():
    """超长 title → 应该正常保存（200）"""
    r = requests.post(f"{BASE}/api/reviews",
                      json={"title": "长" * 500, "platform": "douyin"}, timeout=10)
    assert r.status_code == 200
    _cleanup(r.json().get("id"))


def test_reviews_invalid_views():
    """views 传非数字 → 应该返回 400（严格校验），而不是静默变 0"""
    r = requests.post(f"{BASE}/api/reviews",
                      json={"title": "测试选题-自动化", "platform": "douyin", "views": "abc"}, timeout=10)
    assert r.status_code == 400
