"""假的 DeepSeek 服务器（mock）——测试用，返回固定数据，不花钱不联网。
启动：python tests/mock_deepseek.py   （监听 127.0.0.1:9999）
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

# 假的 AI 回复：5 个选题（和后端约定格式一致）
FAKE_TOPICS = {
    "topics": [
        {"title": "选题1：AI 热点选题助手实战", "angle": "从0到1全栈开发视角", "why": "展示项目落地能力", "tags": ["AI", "全栈"]},
        {"title": "选题2：MCN 达人如何用 AI 提效", "angle": "运营场景案例", "why": "贴合 MCN 行业", "tags": ["MCN", "AI"]},
        {"title": "选题3：测试思维入门", "angle": "从测试员视角讲用例设计", "why": "热门话题", "tags": ["测试"]},
        {"title": "选题4：Vue3 实战小技巧", "angle": "前端开发经验分享", "why": "技术内容有受众", "tags": ["Vue3", "前端"]},
        {"title": "选题5：AI 时代的学习方法", "angle": "个人成长向", "why": "共鸣度高", "tags": ["AI", "学习"]},
    ]
}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 读请求体（后端发来的 messages）
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)

        # 构造 OpenAI 兼容格式的假回复
        content = json.dumps(FAKE_TOPICS, ensure_ascii=False)
        body = json.dumps(
            {"choices": [{"message": {"content": content}}]},
            ensure_ascii=False,
        ).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # 静默，不刷日志


if __name__ == "__main__":
    print("假 DeepSeek 服务器运行中: http://127.0.0.1:9999")
    HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()
