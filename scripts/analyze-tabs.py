import json, re, sys
from collections import Counter, defaultdict
from urllib.parse import urlparse
from datetime import datetime

with open('/tmp/all_tabs.json') as f:
    data = json.load(f)
tabs = data['tabs']

with open('/tmp/tabs_export.json') as f:
    export_data = json.load(f)

now = datetime.utcnow()

domains = Counter()
domain_tabs = defaultdict(list)
for t in tabs:
    d = t.get('domain', '') or 'unknown'
    domains[d] += 1
    domain_tabs[d].append(t)

url_map = defaultdict(list)
for t in tabs:
    try:
        u = urlparse(t['url'])
        normalized = f"{u.hostname}{u.path}".rstrip('/').lower()
    except:
        normalized = t['url']
    url_map[normalized].append(t)

exact_dups = {k: v for k, v in url_map.items() if len(v) > 1}

stop_words = {'the','and','for','with','from','that','this','are','was','not','you','your',
              'can','will','has','have','how','what','why','who','which','where','when',
              'all','but','use','using','one','get','more','new','its','about','into','just',
              'github','com','www','http','https','main','master','blob','tree','readme'}

en_keywords = Counter()
cn_keywords = Counter()
for t in tabs:
    title = (t.get('title') or '').lower()
    for w in re.findall(r'[a-z]{3,}', title):
        if w not in stop_words and len(w) > 2:
            en_keywords[w] += 1
    for w in re.findall(r'[\u4e00-\u9fff]{2,8}', t.get('title') or ''):
        cn_keywords[w] += 1

categories = Counter()
cat_tabs = defaultdict(list)
for t in tabs:
    cat = t.get('category_id') or 'uncategorized'
    categories[cat] += 1
    cat_tabs[cat].append(t)

ages = []
for t in tabs:
    if t.get('first_seen_at'):
        try:
            seen = datetime.fromisoformat(t['first_seen_at'].replace('Z', ''))
            age_days = (now - seen).days
            ages.append((age_days, t))
        except:
            pass

topic_clusters = defaultdict(list)
topic_rules = [
    ('LLM/大模型', ['llm', 'gpt', 'chatgpt', 'openai', 'claude', 'anthropic', 'langchain', 'embedding', 'transformer', '大模型', '语言模型', '生成式', 'rag']),
    ('AI/机器学习', ['machine', 'learning', 'neural', 'deep', 'model', 'training', 'inference', 'diffusion', 'stable', 'midjourney', '人工智能', '机器学习', '深度学习']),
    ('Prompt工程', ['prompt', 'prompting', 'instruction', 'chain', '提示词', '提示工程']),
    ('安全/逆向', ['reverse', 'exploit', 'vulnerability', 'malware', 'binary', 'pwn', 'ctf', 'hook', 'frida', '安全', '逆向', '漏洞', '看雪', 'kanxue']),
    ('前端开发', ['react', 'vue', 'nextjs', 'css', 'javascript', 'typescript', 'frontend', 'component', 'ui', 'tailwind', '前端']),
    ('后端/DevOps', ['docker', 'kubernetes', 'nginx', 'database', 'redis', 'mongodb', 'api', 'server', 'deploy', 'cloud', '后端', '运维', '部署']),
    ('Python', ['python', 'pip', 'fastapi', 'flask', 'django', 'pytorch', 'numpy', 'pandas']),
    ('工具/效率', ['tool', 'extension', 'plugin', 'editor', 'ide', 'cursor', 'vscode', 'notion', 'obsidian', '工具', '效率', '插件']),
    ('数据/向量', ['vector', 'database', 'embedding', 'chromadb', 'pinecone', 'weaviate', 'qdrant', 'faiss', '向量', '数据库', '数据']),
]

for t in tabs:
    title = (t.get('title') or '').lower()
    url = (t.get('url') or '').lower()
    domain = (t.get('domain') or '').lower()
    text = f"{title} {url} {domain}"
    matched = False
    for topic, keywords in topic_rules:
        for kw in keywords:
            if kw in text:
                topic_clusters[topic].append(t)
                matched = True
                break
        if matched:
            break

md = f"""# 浏览器标签深度分析报告

> 生成时间: {now.strftime('%Y-%m-%d %H:%M')} UTC
> 数据来源: Chrome Tab Helper Backend API

---

## 1. 总体概况

| 指标 | 数值 |
|------|------|
| 活跃标签总数 | **{len(tabs)}** |
| 不同域名数 | **{len(domains)}** |
| 完全重复 URL | **{len(exact_dups)} 组** ({sum(len(v)-1 for v in exact_dups.values())} 个可清理) |
| 已分类标签 | **{sum(1 for t in tabs if t.get('category_id') and t['category_id'] != 'other')}** |
| 未分类/其他 | **{categories.get('other', 0) + categories.get('uncategorized', 0)}** |

---

## 2. 域名分布 (Top 20)

| 排名 | 域名 | 数量 | 占比 |
|------|------|------|------|
"""

for i, (domain, count) in enumerate(domains.most_common(20)):
    pct = f"{count/len(tabs)*100:.1f}%"
    md += f"| {i+1} | `{domain}` | {count} | {pct} |\n"

md += f"""
> 前 20 个域名占据了 {sum(c for _, c in domains.most_common(20))} / {len(tabs)} ({sum(c for _, c in domains.most_common(20))/len(tabs)*100:.0f}%) 的标签

---

## 3. 主题聚类分析

基于标题和 URL 关键词的自动聚类：

"""

for topic, topic_tabs in sorted(topic_clusters.items(), key=lambda x: -len(x[1])):
    md += f"### {topic} ({len(topic_tabs)} 个标签)\n\n"
    for t in topic_tabs[:5]:
        title = (t.get('title') or '无标题')[:80]
        md += f"- [{title}]({t['url']})\n"
    if len(topic_tabs) > 5:
        md += f"- *...还有 {len(topic_tabs)-5} 个*\n"
    md += "\n"

md += """---

## 4. 重复标签检测

以下 URL 存在完全重复，建议保留一个关闭其余：

"""

if exact_dups:
    for url, dup_tabs in sorted(exact_dups.items(), key=lambda x: -len(x[1]))[:15]:
        md += f"### {len(dup_tabs)} 个重复: `{url[:80]}`\n"
        for t in dup_tabs:
            md += f"- {t.get('title', '无标题')[:60]} (ID: `{t['id']}`)\n"
        md += "\n"
else:
    md += "> 未发现完全重复的标签\n\n"

md += """---

## 5. 关键词热力图

### 英文关键词 Top 20

"""
for word, count in en_keywords.most_common(20):
    bar = '▓' * min(20, count)
    md += f"| `{word}` | {count} | {bar} |\n"

md += """
### 中文关键词 Top 20

"""
for word, count in cn_keywords.most_common(20):
    bar = '▓' * min(20, count)
    md += f"| {word} | {count} | {bar} |\n"

md += """
---

## 6. 分类分布

"""
for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
    pct = f"{count/len(tabs)*100:.1f}%"
    bar = '█' * min(30, count)
    md += f"| {cat} | {count} | {pct} | {bar} |\n"

md += """
---

## 7. 清理建议

### 高优先级清理 (建议立即处理)

"""

if exact_dups:
    total_dup = sum(len(v)-1 for v in exact_dups.values())
    md += f"1. **清理 {total_dup} 个重复标签** — 可节省 {total_dup} 个标签位\n"

if categories.get('other', 0) > 50:
    md += f"2. **精细分类「其他」中的 {categories.get('other', 0)} 个标签** — 当前占 {categories.get('other', 0)/len(tabs)*100:.0f}% 标签量\n"

md += """
### 分域名清理建议

"""

for domain, count in domains.most_common(10):
    if count >= 5:
        domain_list = domain_tabs[domain]
        titles = [t.get('title', '') for t in domain_list]
        md += f"- **`{domain}`** ({count} 个) — "
        if domain == 'github.com':
            md += "大量 GitHub 仓库，建议 Star 后关闭或归档为书签\n"
        elif 'weixin' in domain or 'qq.com' in domain:
            md += "微信文章，建议批量总结后转为笔记卡片\n"
        elif 'kanxue' in domain:
            md += "看雪论坛帖子，建议按主题收藏后关闭\n"
        elif 'baoyu' in domain:
            md += "AI/技术博客，建议批量总结后存档\n"
        else:
            md += "建议评估是否仍需要，过期的可关闭\n"

md += f"""
---

## 8. 行动计划建议

基于以上分析，建议按以下顺序处理你的 {len(tabs)} 个标签：

1. **第一步：去重** — 使用「去重」功能清理 {len(exact_dups)} 组重复标签
2. **第二步：AI 分类** — 对 160 个「其他」标签进行 AI 精细分类
3. **第三步：批量总结** — 对每个分类执行「分类总结」，获取阅读优先级
4. **第四步：GitHub 仓库** — 75 个 GitHub 标签大部分可以 Star + 收藏后关闭
5. **第五步：文章归档** — 微信/博客类文章生成笔记卡片导出到 Apple Notes
6. **第六步：设定预算** — 将标签预算设为 50，保持日常标签数量可控

预计清理后可将标签数从 **{len(tabs)}** 降至 **30-50** 个活跃标签。

---

*报告由 Chrome Tab Helper AI 分析引擎生成*
"""

output_path = '/Volumes/DATA/vip/chrome_tab_helper/reports/tab-analysis-report.md'
import os
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(md)
print(f"Report saved to: {output_path}")
print(f"Report length: {len(md)} chars")
