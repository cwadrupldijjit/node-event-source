import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use((req, res, next) => {
    console.log(Date.now(), 'protocol:', req.protocol);
    let count = 0;
    const serverSideEventsId = Date.now();
    
    res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
    });
    
    const interval = setInterval(() => {
        if (count == 10) {
            res.write('id: ' + serverSideEventsId + '\n');
            res.write('data: ' + JSON.stringify({ message: 'this is the final event' }) + '\n\n');
            res.end();
            
            clearInterval(interval);
            return;
        }
        res.write('id: ' + serverSideEventsId + '\n');
        res.write('data: ' + JSON.stringify({ message: 'this is event number ' + count++ }) + '\n\n');
    }, 1000);
    
    res.on('close', () => {
        console.log('closing sseid', serverSideEventsId);
        clearInterval(interval);
    });
});

app.listen(3038, () => {
    console.log('Listening on port 3038');
});
