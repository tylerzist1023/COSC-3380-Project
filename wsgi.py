from coogmusic import app,conn

if __name__ == '__main__':
    try:
        app.jinja_env.trim_blocks = True
        app.jinja_env.lstrip_blocks = True
        app.run()
        conn.close()
    except:
        conn.close()