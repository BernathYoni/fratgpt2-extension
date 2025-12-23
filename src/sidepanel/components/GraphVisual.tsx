import React, { useEffect, useRef } from 'react';
import functionPlot from 'function-plot';

interface GraphVisualProps {
  data: string;
  caption?: string;
}

export const GraphVisual: React.FC<GraphVisualProps> = ({ data, caption }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current || !data) return;

    try {
      // Parse data - if it's a simple string like "x^2", use it directly.
      // If it's complex, we might need more validation.
      // function-plot expects an array of function objects.
      
      const width = rootRef.current.clientWidth || 300;
      
      functionPlot({
        target: rootRef.current,
        width: width,
        height: 200,
        yAxis: { domain: [-5, 5] },
        grid: true,
        data: [{
          fn: data,
          graphType: 'polyline'
        }]
      });
    } catch (e) {
      console.error('Graph rendering failed:', e);
    }
  }, [data]);

  return (
    <div className="graph-container" style={{ marginTop: '12px', marginBottom: '12px' }}>
      <div ref={rootRef} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}></div>
      {caption && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic', textAlign: 'center' }}>{caption}</div>}
    </div>
  );
};
