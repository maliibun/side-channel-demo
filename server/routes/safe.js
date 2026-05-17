import express from 'express';
import crypto from 'crypto';

const router = express.Router();

//constant-time compare via crypto.timingSafeEqual
//pads guess to secret length so length mismatch doesn't leak via early return
router.post('/verify', (req, res) => {
    const { guess } = req.body;
    const secret = req.app.locals.secret;

    const padded = Buffer.alloc(secret.length);
    Buffer.from(guess ?? '', 'hex').copy(padded);

    const start = process.hrtime.bigint();
    const ok = crypto.timingSafeEqual(padded, secret);
    const elapsedNs = (process.hrtime.bigint() - start).toString();

    res.json({ok, elapsedNs});
});

export default router;
