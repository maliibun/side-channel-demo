import { createPortal } from 'react-dom';

//renders children into the global #controlbar element at the bottom of the viewport
//each page passes its parameter controls + run button through this component so the bar shape
//is shared and doesn't compete for space inside the panel
export default function ControlBar({ children }){
    const el = typeof document !== 'undefined' ? document.getElementById('controlbar') : null;
    if(!el) return null;
    return createPortal(
        <div className="controlbar">
            <div className="controlbar__inner">{children}</div>
        </div>,
        el,
    );
}
