import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { URL } from 'url';
import express, { NextFunction, Request, Response } from 'express';
import parseCsp from 'content-security-policy-parser';
import { getCSP as serializeCsp } from 'csp-header';
import helmet from 'helmet';
import cors from 'cors';
import { uid } from 'uid';
import { parse as parseHtml } from 'node-html-parser';

const __dirname = new URL(dirname(import.meta.url)).pathname.slice(Number(process.platform == 'win32'));

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// this could be added as part of the module so that it doesn't have to be slapped here
eventSource.init = function init() {
    return (req: Request, res: Response, next: NextFunction) => {
        Object.defineProperty(res, 'isEventStream', {
            get() {
                return req.headers.accept.includes('text/event-stream') && Boolean(this._eventId);
            },
        });
        
        next();
    };
};

// I can't see how to avoid having this extra step with the middleware in order to get the res.isEventStream...
app.use(eventSource.init());

app.get('/event-stream', eventSource(), (req, res, next) => {
    console.log(Date.now(), 'This is an event stream:', res.isEventStream);
    let count = 0;
    
    const interval = setInterval(() => {
        if (count == 10) {
            res.sendMessage({ message: 'this is the final event' });
            res.end();
            
            clearInterval(interval);
            return;
        }
        res.sendMessage({ message: 'this is event number ' + count++ });
    }, 1000);
});

// serve up the index.html (because of helmet, tweak the CSP settings, too)
app.all('*', async (req, res) => {
    const nonce = uid(15);
    
    const indexHtml = parseHtml(await readFile(join(__dirname, 'index.html'), 'utf-8'));
    indexHtml.querySelector('script').setAttribute('nonce', nonce);
    
    const csp = parseCsp(res.getHeader('Content-Security-Policy') as string);
    
    csp['script-src'].push(`'nonce-${nonce}'`);
    
    res.setHeader('Content-Security-Policy', serializeCsp({ directives: csp }));
    
    res.send(indexHtml.innerHTML);
});

app.listen(3038, () => {
    console.log('Listening on port 3038');
});

interface EventSourceMiddlewareOptions {
    requireEventStreamHeader?: boolean;
    // TODO: add an XML format option
    dataAs?: 'json' | 'plain' | 'base64';
}

function eventSource(options?: EventSourceMiddlewareOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (options?.requireEventStreamHeader && !req.headers.accept.includes('text/event-stream')) {
            res.status(400);
            res.send({ message: 'This endpoint is meant to be used with an EventSource only' });
            return;
        }
        else if (req.headers.accept.includes('text/event-stream')) {
            const eventId = uid(15);
            
            console.log('event stream starting with id of %s', eventId);
            
            res._eventId = eventId;
            
            res.writeHead(200, {
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Content-Type': 'text/event-stream',
            });
            
            res.sendMessage = (data: any) => {
                const frame = 'id: ' + eventId + '\n' +
                    'data: ';
                
                if (!options?.dataAs || options?.dataAs == 'json') {
                    return res.write(frame + JSON.stringify(data) + '\n\n');
                }
            };
            
            res.once('close', () => {
                console.log('event stream %s has closed', eventId);
            });
        }
        
        next();
    };
}

declare global {
    namespace Express {
        interface Response {
            sendMessage?: (data: any) => void;
            _eventId?: string;
            readonly isEventStream?: boolean;
        }
    }
}
