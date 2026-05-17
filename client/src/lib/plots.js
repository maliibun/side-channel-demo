//pure data builders for Plotly - no React, no Plotly imports
//pages call these to shape arrays into the structures Plotly expects

export function tracePlot(trace, color = '#3498db'){
    return [{type: 'scatter', mode: 'lines', y: Array.from(trace), line: {color, width: 1}}];
}

//highlights: {[idx]: color} - e.g. {5: '#27ae60', 10: '#e74c3c'}
export function keyGuessBars(values, highlights = {}, baseColor = '#3498db'){
    const colors = new Array(values.length);
    for(let i = 0; i < values.length; i++) colors[i] = highlights[i] ?? baseColor;
    return [{
        type: 'bar',
        x: Array.from({length: values.length}, (_, i) => i),
        y: Array.from(values),
        marker: {color: colors},
    }];
}

export function heatmap(flat, rows, cols, colorscale = 'Viridis'){
    const z = new Array(rows);
    for(let r = 0; r < rows; r++){
        const row = new Array(cols);
        for(let c = 0; c < cols; c++) row[c] = flat[r * cols + c];
        z[r] = row;
    }
    return [{type: 'heatmap', z, colorscale, showscale: true}];
}

//layout fragment for a vertical marker line + label at sample index x
export function verticalMarker(x, label, color = '#e74c3c'){
    return {
        shapes: [{
            type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper',
            line: {color, width: 1.5, dash: 'dot'},
        }],
        annotations: [{
            x, y: 1, yref: 'paper', text: label, showarrow: false,
            font: {size: 11, color}, xanchor: 'left', yanchor: 'top',
        }],
    };
}

export function argMax(arr){
    let m = 0;
    for(let i = 1; i < arr.length; i++) if(arr[i] > arr[m]) m = i;
    return m;
}
