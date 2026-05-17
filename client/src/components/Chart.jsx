import { useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';

const BASE_LAYOUT = {
    margin: {t: 40, r: 20, b: 50, l: 60},
    height: 280,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {size: 12},
};

//thin wrapper around Plotly.react - merges base layout with the caller's overrides
export default function Chart({ data, layout, style }){
    const ref = useRef(null);
    useEffect(() => {
        if(ref.current) Plotly.react(ref.current, data, {...BASE_LAYOUT, ...layout});
    }, [data, layout]);
    return <div ref={ref} style={{width: '100%', ...style}} />;
}
