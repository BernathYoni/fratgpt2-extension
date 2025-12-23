import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface DiagramVisualProps {
  data: string;
  caption?: string;
}

export const DiagramVisual: React.FC<DiagramVisualProps> = ({ data, caption }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'default',
      securityLevel: 'loose',
    });

    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, data);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error('Mermaid rendering failed:', error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="color:red; font-size:12px;">Failed to render diagram</div>`;
        }
      }
    };

    renderDiagram();
  }, [data]);

  return (
    <div className="diagram-container" style={{ marginTop: '12px', marginBottom: '12px', textAlign: 'center' }}>
      <div ref={containerRef} style={{ overflowX: 'auto' }}></div>
      {caption && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>{caption}</div>}
    </div>
  );
};
