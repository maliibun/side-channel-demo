import { useRef, useEffect } from 'react';
import { initShader } from '../lib/shader';

//mounts a fixed-position canvas behind everything, runs the kinetic-grid shader
export default function ShaderBackground(){
    const ref = useRef(null);
    useEffect(() => {
        if(!ref.current) return;
        const cleanup = initShader(ref.current);
        return cleanup;
    }, []);
    return <canvas id="bg-shader" ref={ref} />;
}
