from coogmusic import app

if __name__ == '__main__':
    app.jinja_env.trim_blocks = True
    app.jinja_env.lstrip_blocks = True
    app.run()