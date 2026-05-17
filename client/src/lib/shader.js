//kinetic grid - spring-mass mesh that ripples on periodic impulses
//exported as initShader(canvas) which returns a cleanup function

export function initShader(canvas){
    const ctx = canvas.getContext('2d');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    let running = true;

    //tunables
    let IMPULSE_RATE = 0.7;
    let SPRING_TENSION = 1.0;
    let IMPULSE_STRENGTH = 0.75;

    //grid dimensions - smaller mesh = fewer strokes per frame
    const COLS = 26, ROWS = 16;
    let DAMPING = 0.978;
    let RETURN_FORCE = 0.003;
    const SPRING_K_BASE = 0.12;

    const nodeCount = COLS * ROWS;
    const posX = new Float32Array(nodeCount);
    const posY = new Float32Array(nodeCount);
    const velX = new Float32Array(nodeCount);
    const velY = new Float32Array(nodeCount);
    const restX = new Float32Array(nodeCount);
    const restY = new Float32Array(nodeCount);

    let springs = [];
    let flashes = [];
    let lastTime = 0;
    let timeSinceImpulse = 0;
    let impulseInterval = 1.0 / IMPULSE_RATE;
    let spacingX = 0, spacingY = 0, marginX = 0, marginY = 0;
    let screenFlash = 0;
    let rafId = 0;

    function idx(col, row){ return row * COLS + col; }

    function buildGrid(){
        marginX = W * 0.06;
        marginY = H * 0.06;
        spacingX = (W - marginX * 2) / (COLS - 1);
        spacingY = (H - marginY * 2) / (ROWS - 1);

        for(let r = 0; r < ROWS; r++){
            for(let c = 0; c < COLS; c++){
                const i = idx(c, r);
                const x = marginX + c * spacingX;
                const y = marginY + r * spacingY;
                restX[i] = x; restY[i] = y;
                posX[i] = x; posY[i] = y;
                velX[i] = 0; velY[i] = 0;
            }
        }

        springs = [];
        for(let r = 0; r < ROWS; r++){
            for(let c = 0; c < COLS; c++){
                const ii = idx(c, r);
                if(c < COLS - 1) springs.push(ii, idx(c + 1, r), spacingX);
                if(r < ROWS - 1) springs.push(ii, idx(c, r + 1), spacingY);
            }
        }
    }

    function resize(){
        //cap DPR at 1.25 - canvas pixel-fill is a major cost on hi-DPI screens
        dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildGrid();
    }

    function injectInteriorImpulse(mx, my, strength){
        const maxSpacing = Math.max(spacingX, spacingY);
        const radiusPx = 3.5 * maxSpacing;
        for(let r = 0; r < ROWS; r++){
            for(let c = 0; c < COLS; c++){
                const i = idx(c, r);
                const dx = restX[i] - mx;
                const dy = restY[i] - my;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if(dist < radiusPx && dist > 0.1){
                    let falloff = 1 - dist / radiusPx;
                    falloff *= falloff;
                    velX[i] += (dx / dist) * strength * falloff;
                    velY[i] += (dy / dist) * strength * falloff;
                }
            }
        }
        flashes.push({x: mx, y: my, life: 0.8, ring: 0.8});
    }

    function injectImpulse(){
        const baseStrength = (10 + Math.random() * 6) * IMPULSE_STRENGTH;
        const px = marginX + Math.random() * (W - marginX * 2);
        const py = marginY + Math.random() * (H - marginY * 2);
        injectInteriorImpulse(px, py, baseStrength);
        screenFlash = 0.015;
    }

    function simulate(){
        if(prefersReduced) return;
        const springK = SPRING_K_BASE * SPRING_TENSION;
        const springCount = springs.length / 3;

        for(let s = 0; s < springCount; s++){
            const s3 = s * 3;
            const a = springs[s3];
            const b = springs[s3 + 1];
            const restLen = springs[s3 + 2];
            const dx = posX[b] - posX[a];
            const dy = posY[b] - posY[a];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if(dist < 0.001) continue;
            const stretch = dist - restLen;
            const force = springK * stretch / dist;
            const fx = dx * force;
            const fy = dy * force;
            velX[a] += fx; velY[a] += fy;
            velX[b] -= fx; velY[b] -= fy;
        }

        for(let i = 0; i < nodeCount; i++){
            velX[i] += (restX[i] - posX[i]) * RETURN_FORCE;
            velY[i] += (restY[i] - posY[i]) * RETURN_FORCE;
            velX[i] *= DAMPING;
            velY[i] *= DAMPING;
            posX[i] += velX[i];
            posY[i] += velY[i];
        }
    }

    //uniform warm cream color, alpha grows with tension
    function tensionColor(tension){
        const t = tension < 0 ? 0 : (tension > 1 ? 1 : tension);
        const r = 230 + t * 25;
        const g = 200 + t * 40;
        const b = 165 + t * 60;
        const a = 0.15 + t * 0.65;
        return {r: Math.round(r), g: Math.round(g), b: Math.round(b), a};
    }

    function render(now){
        if(!running) return;
        const time = now * 0.001;
        let dt = lastTime === 0 ? 0.016 : (time - lastTime);
        if(dt > 0.1) dt = 0.016;
        lastTime = time;

        timeSinceImpulse += dt;
        impulseInterval = 1.8 / IMPULSE_RATE;
        if(timeSinceImpulse >= impulseInterval){
            injectImpulse();
            timeSinceImpulse -= impulseInterval;
            timeSinceImpulse -= Math.random() * impulseInterval * 0.3;
        }

        simulate();

        //warm dark beige -> deeper warm gradient base
        ctx.globalCompositeOperation = 'source-over';
        const gx = W * (0.35 + 0.15 * Math.sin(time * 0.10));
        const gy = H * (0.4 + 0.12 * Math.cos(time * 0.07));
        const maxR = Math.sqrt(W * W + H * H) * 0.75;
        const bgGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, maxR);
        bgGrad.addColorStop(0,    '#352715');
        bgGrad.addColorStop(0.35, '#1c130a');
        bgGrad.addColorStop(0.75, '#0c0805');
        bgGrad.addColorStop(1,    '#050302');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        if(screenFlash > 0.001) screenFlash *= 0.88;

        const avgSpacing = (spacingX + spacingY) * 0.5;
        const tensionScale = 1.0 / (avgSpacing * 0.35);
        const breathe = 0.85 + 0.15 * Math.sin(time * 0.8);

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const springCount = springs.length / 3;

        //single pass: compute tension once per spring, draw glow (only if tension is noticeable)
        //and core line in the same iteration
        const GLOW_TENSION_THRESHOLD = 0.12;
        for(let s = 0; s < springCount; s++){
            const s3 = s * 3;
            const a = springs[s3], b = springs[s3 + 1], restLen = springs[s3 + 2];
            const ax = posX[a], ay = posY[a], bx = posX[b], by = posY[b];
            const dx = bx - ax, dy = by - ay;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const stretch = Math.abs(dist - restLen);
            const tension = stretch * tensionScale;
            const col = tensionColor(tension);
            const colStr = col.r + ',' + col.g + ',' + col.b;

            //glow - only for tense springs (most idle springs skip this entirely)
            if(tension > GLOW_TENSION_THRESHOLD){
                const glowAlpha = (0.02 + tension * 0.1) * breathe;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.strokeStyle = 'rgba(' + colStr + ',' + glowAlpha.toFixed(4) + ')';
                ctx.lineWidth = 3 + tension * 6;
                ctx.stroke();
            }

            //core line - always drawn
            let coreAlpha = (0.07 + tension * 0.45) * breathe;
            if(coreAlpha > 1) coreAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = 'rgba(' + colStr + ',' + coreAlpha.toFixed(4) + ')';
            ctx.lineWidth = 0.5 + tension * 1.2;
            ctx.stroke();
        }

        //layer 3: nodes + wavefront bloom
        const velocityThreshold = 3.0;
        for(let i = 0; i < nodeCount; i++){
            const vx = velX[i], vy = velY[i];
            const speed = Math.sqrt(vx * vx + vy * vy);
            let brightness = speed * 0.2;
            if(brightness < 0.02) continue;
            if(brightness > 1) brightness = 1;

            let nr, ng, nb, nf;
            if(brightness < 0.25){
                nf = brightness / 0.25;
                nr = 15 + nf * 10; ng = 30 + nf * 170; nb = 70 + nf * 185;
            } else if(brightness < 0.6){
                nf = (brightness - 0.25) / 0.35;
                nr = 25 + nf * 210; ng = 200 + nf * 20; nb = 255;
            } else {
                nf = (brightness - 0.6) / 0.4;
                nr = 235 + nf * 20; ng = 220 + nf * 35; nb = 255;
            }
            const nodeAlpha = 0.12 + brightness * 0.75;
            const nodeRadius = 0.8 + brightness * 2.0;

            if(speed > velocityThreshold){
                let bloomIntensity = (speed - velocityThreshold) / 15.0;
                if(bloomIntensity > 1) bloomIntensity = 1;
                const haloRadius = 4 + bloomIntensity * 12;
                const haloAlpha = bloomIntensity * 0.35;
                const haloR = Math.round(220 + bloomIntensity * 35);
                const haloG = Math.round(80 + bloomIntensity * 60);
                const haloB = Math.round(15 + bloomIntensity * 40);
                ctx.beginPath();
                ctx.arc(posX[i], posY[i], haloRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + haloR + ',' + haloG + ',' + haloB + ',' + haloAlpha.toFixed(3) + ')';
                ctx.fill();
                const coreBloomRadius = 2 + bloomIntensity * 4;
                const coreBloomAlpha = bloomIntensity * 0.6;
                ctx.beginPath();
                ctx.arc(posX[i], posY[i], coreBloomRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 220, 170, ' + coreBloomAlpha.toFixed(3) + ')';
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(posX[i], posY[i], nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + Math.round(nr) + ',' + Math.round(ng) + ',' + Math.round(nb) + ',' + nodeAlpha.toFixed(3) + ')';
            ctx.fill();
        }

        //layer 4: impulse flashes
        for(let fi = flashes.length - 1; fi >= 0; fi--){
            const flash = flashes[fi];
            flash.life -= dt * 2.0;
            if(flash.ring !== undefined) flash.ring -= dt * 1.8;
            if(flash.life <= 0){ flashes.splice(fi, 1); continue; }
            const fl = flash.life;
            const flashRadius = (1 - fl) * 100 + 20;
            const flashAlpha = fl * fl * 0.8;
            const grad = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flashRadius);
            grad.addColorStop(0, 'rgba(240, 220, 180, ' + flashAlpha.toFixed(3) + ')');
            grad.addColorStop(0.2, 'rgba(220, 190, 140, ' + (flashAlpha * 0.6).toFixed(3) + ')');
            grad.addColorStop(0.5, 'rgba(160, 130, 90, ' + (flashAlpha * 0.25).toFixed(3) + ')');
            grad.addColorStop(1, 'rgba(80, 60, 30, 0)');
            ctx.beginPath();
            ctx.arc(flash.x, flash.y, flashRadius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            if(flash.ring !== undefined && flash.ring > 0){
                const ringProgress = 1 - flash.ring;
                const ringRadius = 15 + ringProgress * 120;
                const ringAlpha = flash.ring * flash.ring * 0.5;
                ctx.beginPath();
                ctx.arc(flash.x, flash.y, ringRadius, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(220, 195, 145, ' + ringAlpha.toFixed(3) + ')';
                ctx.lineWidth = 2.0 * flash.ring;
                ctx.stroke();
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        rafId = requestAnimationFrame(render);
    }

    function onVisibility(){
        if(document.hidden){
            running = false;
        } else {
            running = true;
            lastTime = 0;
            rafId = requestAnimationFrame(render);
        }
    }

    function onMessage(e){
        if(!e.data || e.data.type !== 'param') return;
        switch(e.data.name){
            case 'IMPULSE_RATE':     IMPULSE_RATE = e.data.value; break;
            case 'SPRING_TENSION':   SPRING_TENSION = e.data.value; break;
            case 'DAMPING':          DAMPING = e.data.value; break;
            case 'RETURN_FORCE':     RETURN_FORCE = e.data.value; break;
            case 'IMPULSE_STRENGTH': IMPULSE_STRENGTH = e.data.value; break;
        }
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('message', onMessage);

    resize();
    ctx.clearRect(0, 0, W, H);
    injectImpulse();
    rafId = requestAnimationFrame(render);

    //cleanup
    return () => {
        running = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('message', onMessage);
    };
}
