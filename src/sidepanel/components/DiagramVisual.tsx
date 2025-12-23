import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface DiagramVisualProps {
  data: string;
  caption?: string;
}

export const DiagramVisual: React.FC<DiagramVisualProps> = ({ data, caption }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !data) return;
    setHasError(false);

    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'default',
      securityLevel: 'loose',
      suppressErrorRendering: true // IMPORTANT: Disable default bomb icon
    });

    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        // Clean up common AI syntax mistakes
        let cleanData = data
          .replace(/```mermaid/g, '')
          .replace(/```/g, '')
          .trim();
          
        const { svg } = await mermaid.render(id, cleanData);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error('Mermaid rendering failed:', error);
        setHasError(true);
      }
    };

    renderDiagram();
  }, [data]);

  if (hasError) {
    return (
      <div className="diagram-error" style={{ 
        marginTop: '12px', 
        padding: '12px', 
        background: '#fff5f5', 
        border: '1px solid #feb2b2', 
        borderRadius: '8px',
        color: '#c53030',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <div>Unable to visualize diagram.</div>
        <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.8 }}>
          {data.substring(0, 100)}...
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-container" style={{ marginTop: '12px', marginBottom: '12px', textAlign: 'center' }}>
      <div ref={containerRef} style={{ overflowX: 'auto' }}></div>
      {caption && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>{caption}</div>}
    </div>
  );
};
