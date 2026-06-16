import os
import re
import time
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Atom feed URL and namespace
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
ATOM_NS = {'atom': 'http://www.w3.org/2005/Atom'}

# Simple in-memory cache
cache = {
    'data': None,
    'last_updated': 0
}
CACHE_DURATION = 600  # 10 minutes (in seconds)

def parse_updates_from_html(html, date):
    """
    Splits the HTML content of an entry into individual update items
    based on <h3> tags.
    """
    if not html:
        return []
    
    # Match all <h3>Type</h3> blocks
    pattern = re.compile(r'<h3>(.*?)</h3>', re.IGNORECASE)
    matches = list(pattern.finditer(html))
    
    updates = []
    for i, match in enumerate(matches):
        update_type = match.group(1).strip()
        if update_type.lower() == 'deprecated':
            continue
        start_pos = match.end()
        end_pos = matches[i+1].start() if i+1 < len(matches) else len(html)
        
        update_content = html[start_pos:end_pos].strip()
        
        # Clean up text for tweeting: strip HTML tags
        plain_text = re.sub(r'<[^>]+>', '', update_content)
        plain_text = ' '.join(plain_text.split())
        
        # Generate a unique ID for selection
        date_slug = re.sub(r'[^a-zA-Z0-9]', '_', date)
        update_id = f"{date_slug}_{i}"
        
        updates.append({
            'id': update_id,
            'type': update_type,
            'html': update_content,
            'plain_text': plain_text
        })
        
    # If no <h3> headings found, treat the whole block as one update
    if not matches:
        plain_text = re.sub(r'<[^>]+>', '', html)
        plain_text = ' '.join(plain_text.split())
        date_slug = re.sub(r'[^a-zA-Z0-9]', '_', date)
        updates.append({
            'id': f"{date_slug}_0",
            'type': 'Update',
            'html': html,
            'plain_text': plain_text
        })
        
    return updates

def fetch_and_parse_feed():
    """
    Fetches the BigQuery release notes XML feed, parses it, and structures it.
    """
    try:
        response = requests.get(FEED_URL, timeout=10)
        response.raise_for_status()
        
        root = ET.fromstring(response.content)
        
        parsed_entries = []
        for entry in root.findall('atom:entry', ATOM_NS):
            title = entry.find('atom:title', ATOM_NS)
            title_text = title.text.strip() if title is not None else "Unknown Date"
            
            updated = entry.find('atom:updated', ATOM_NS)
            updated_text = updated.text.strip() if updated is not None else ""
            
            link_el = entry.find('atom:link[@rel="alternate"]', ATOM_NS)
            if link_el is None:
                link_el = entry.find('atom:link', ATOM_NS)
            link_url = link_el.attrib.get('href', '').strip() if link_el is not None else ''
            
            content_el = entry.find('atom:content', ATOM_NS)
            content_html = content_el.text if content_el is not None else ''
            
            updates = parse_updates_from_html(content_html, title_text)
            if not updates:
                continue
            
            parsed_entries.append({
                'date': title_text,
                'updated': updated_text,
                'link': link_url,
                'updates': updates
            })
            
        return parsed_entries, None
    except Exception as e:
        return None, str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    # If cache is valid and refresh is not forced, return cached data
    if not force_refresh and cache['data'] and (current_time - cache['last_updated'] < CACHE_DURATION):
        return jsonify({
            'status': 'success',
            'source': 'cache',
            'last_updated': cache['last_updated'],
            'data': cache['data']
        })
        
    # Otherwise fetch fresh data
    data, error = fetch_and_parse_feed()
    if error:
        return jsonify({
            'status': 'error',
            'message': f"Failed to retrieve release notes: {error}"
        }), 500
        
    cache['data'] = data
    cache['last_updated'] = current_time
    
    return jsonify({
        'status': 'success',
        'source': 'network',
        'last_updated': current_time,
        'data': data
    })

if __name__ == '__main__':
    # Defaulting to port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
