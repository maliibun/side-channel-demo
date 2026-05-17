import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import cpuModelUrl from '../assets/intel_cpu.glb?url';

//3D CPU visualization
//tries to load /intel_cpu.glb; falls back to procedural chip geometry on any error
//red wave pulses emanate while `attacking` is true
export default function CPU3D({ attacking }){
    const mountRef = useRef(null);
    const stateRef = useRef({pulseRate: 0.002, lastSpawn: 0});
    const [loaderState, setLoaderState] = useState('init');

    useEffect(() => {
        stateRef.current.pulseRate = attacking ? 0.012 : 0.002;
    }, [attacking]);

    useEffect(() => {
        let cancelled = false;
        let raf = 0;
        let cleanup = () => {};

        const container = mountRef.current;
        if(!container) return;

        const width = container.clientWidth;
        const height = 320;

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
        camera.position.set(4.2, 3.5, 5.0);
        camera.lookAt(0, 1.0, 0);

        const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.6;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);

        //lighting
        scene.add(new THREE.HemisphereLight(0xffffff, 0x44342a, 0.7));
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const key = new THREE.DirectionalLight(0xfff4dd, 1.8);
        key.position.set(4, 6, 3);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.9);
        fill.position.set(-3, 4, 2);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xe11d48, 0.5);
        rim.position.set(-2, 1, -3);
        scene.add(rim);
        const back = new THREE.DirectionalLight(0xfff4dd, 0.6);
        back.position.set(0, 2, -5);
        scene.add(back);

        const stage = new THREE.Group();
        scene.add(stage);

        //EM probe - ring (sensing coil) at bottom, stalk going up
        const probeGroup = new THREE.Group();
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.045, 12, 32),
            new THREE.MeshStandardMaterial({color: 0xcccccc, roughness: 0.2, metalness: 0.9}),
        );
        ring.rotation.x = Math.PI / 2;
        probeGroup.add(ring);
        const stalk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.035, 1.6, 12),
            new THREE.MeshStandardMaterial({color: 0x2a2a2a, roughness: 0.55, metalness: 0.4}),
        );
        stalk.position.y = 0.85;
        probeGroup.add(stalk);
        probeGroup.position.set(0, 1.7, 0);
        stage.add(probeGroup);

        //wave pool - attached to stage so they orbit with the chip
        const waveColor = 0xe11d48;
        const wavePool = [];
        const MAX_WAVES = 10;
        for(let i = 0; i < MAX_WAVES; i++){
            const w = new THREE.Mesh(
                new THREE.RingGeometry(0.3, 0.36, 40),
                new THREE.MeshBasicMaterial({color: waveColor, transparent: true, opacity: 0, side: THREE.DoubleSide}),
            );
            w.rotation.x = -Math.PI / 2;
            w.position.y = 0.35;
            w.visible = false;
            stage.add(w);
            wavePool.push({mesh: w, age: 0, alive: false});
        }

        function spawnWave(){
            const free = wavePool.find(w => !w.alive);
            if(!free) return;
            free.alive = true;
            free.age = 0;
            free.mesh.visible = true;
            free.mesh.scale.set(1, 1, 1);
            free.mesh.material.opacity = 0.75;
        }

        function buildProcedural(){
            const pcb = new THREE.Mesh(
                new THREE.BoxGeometry(4.2, 0.12, 3.4),
                new THREE.MeshStandardMaterial({color: 0xf5efe2, roughness: 0.8, metalness: 0.05}),
            );
            pcb.position.y = -0.06;
            stage.add(pcb);

            const traceMat = new THREE.MeshStandardMaterial({color: 0x8a5a1d, roughness: 0.45, metalness: 0.6});
            for(let i = 0; i < 6; i++){
                const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 1.4), traceMat);
                t.position.set(-1.5 + i * 0.6, 0.01, -0.7);
                stage.add(t);
            }

            const chipBody = new THREE.Mesh(
                new THREE.BoxGeometry(2.0, 0.28, 1.2),
                new THREE.MeshStandardMaterial({color: 0x141414, roughness: 0.6, metalness: 0.25}),
            );
            chipBody.position.y = 0.2;
            stage.add(chipBody);

            const notch = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16),
                new THREE.MeshStandardMaterial({color: 0x2a2a2a, roughness: 0.8}),
            );
            notch.position.set(-0.85, 0.35, 0);
            stage.add(notch);

            const pinMat = new THREE.MeshStandardMaterial({color: 0xc8c8c8, roughness: 0.3, metalness: 0.85});
            for(let i = 0; i < 8; i++){
                const x = -0.9 + (i * 1.8) / 7;
                const pinT = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.32), pinMat);
                pinT.position.set(x, 0.04, -0.74);
                stage.add(pinT);
                const pinB = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.32), pinMat);
                pinB.position.set(x, 0.04, 0.74);
                stage.add(pinB);
            }
        }

        const loader = new GLTFLoader();
        loader.load(
            cpuModelUrl,
            (gltf) => {
                if(cancelled) return;
                const model = gltf.scene;
                //fit and center the model so it sits on the PCB plane y=0
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const scale = 3.0 / maxDim;
                model.scale.setScalar(scale);
                model.position.x = -center.x * scale;
                model.position.z = -center.z * scale;
                model.position.y = -box.min.y * scale;
                stage.add(model);
                setLoaderState('gltf');
            },
            undefined,
            (err) => {
                console.warn('[CPU3D] failed to load', cpuModelUrl, 'using procedural fallback', err);
                buildProcedural();
                setLoaderState('procedural');
            },
        );

        let last = performance.now();
        let acc = 0;

        function tick(){
            const now = performance.now();
            const dt = now - last;
            last = now;

            stage.rotation.y += dt * 0.00018;
            probeGroup.position.y = 1.7 + Math.sin(now * 0.0012) * 0.05;

            acc += dt;
            const interval = 1 / stateRef.current.pulseRate;
            if(acc >= interval){
                acc = 0;
                spawnWave();
            }

            wavePool.forEach(w => {
                if(!w.alive) return;
                w.age += dt;
                const t = w.age / 1400;
                if(t >= 1){
                    w.alive = false;
                    w.mesh.visible = false;
                    return;
                }
                const s = 1 + t * 4;
                w.mesh.scale.set(s, s, s);
                w.mesh.material.opacity = 0.75 * (1 - t);
            });

            renderer.render(scene, camera);
            raf = requestAnimationFrame(tick);
        }
        tick();

        function onResize(){
            const w = container.clientWidth;
            camera.aspect = w / height;
            camera.updateProjectionMatrix();
            renderer.setSize(w, height);
        }
        window.addEventListener('resize', onResize);

        cleanup = () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
            renderer.dispose();
            if(renderer.domElement.parentNode === container){
                container.removeChild(renderer.domElement);
            }
        };

        return () => {
            cancelled = true;
            cleanup();
        };
    }, []);

    return (
        <div className="cpu3d">
            <div ref={mountRef} className="cpu3d__mount" />
            <div className="cpu3d__legend mono">
                <span><span className="cpu3d__swatch cpu3d__swatch--chip"></span> chip die</span>
                <span><span className="cpu3d__swatch cpu3d__swatch--probe"></span> EM probe</span>
                <span><span className="cpu3d__swatch cpu3d__swatch--wave"></span> EM emanation</span>
                <span className="cpu3d__loader-state">
                    {loaderState === 'gltf' ? 'model loaded' : loaderState === 'procedural' ? 'procedural fallback' : 'loading...'}
                </span>
            </div>
        </div>
    );
}
