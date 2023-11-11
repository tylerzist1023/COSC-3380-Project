const http = require('http');
const server = http.createServer((req,res) => {
    res.end("Helloss Wowrlccd dfrom Node Js");
});
server.listen(3000);
