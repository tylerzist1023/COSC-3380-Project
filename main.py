from flask import Flask, render_template
import pyodbc

conn = pyodbc.connect('DRIVER={SQL Server};'
                      'SERVER=coogmusicserver.windows.database.net;'
                      'DATABASE=coogmusic;'
                      'UID=CloudSA5fb1e56b;'
                      'PWD=Coogs4lyfe!;')
cursor = conn.cursor()

app = Flask(__name__)

@app.route('/')
def index():
    cursor.execute('SELECT * FROM song')
    data = cursor.fetchall()
    return render_template('index.html', name=data)

if __name__ == '__main__':
    app.run(debug=True)

