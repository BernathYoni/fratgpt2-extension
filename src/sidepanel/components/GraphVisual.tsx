import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import * as math from 'mathjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface GraphVisualProps {
  data: string;
  caption?: string;
}

export const GraphVisual: React.FC<GraphVisualProps> = ({ data, caption }) => {
  const chartData = useMemo(() => {
    try {
      // 1. Clean the equation string
      // Remove "y=" or "f(x)=" prefix if present
      let equation = data.replace(/^[a-zA-Z0-9]+\(x\)\s*=\s*/, '').replace(/^y\s*=\s*/, '').trim();
      
      // 2. Generate points
      const xValues: number[] = [];
      const yValues: number[] = [];
      const range = 10;
      const step = 0.5;

      for (let x = -range; x <= range; x += step) {
        try {
          // Use mathjs to safely evaluate the expression
          // This avoids 'eval()' and is CSP compliant
          const scope = { x };
          const y = math.evaluate(equation, scope);
          
          // Handle asymptotes/infinity
          if (isFinite(y) && Math.abs(y) < 50) {
             xValues.push(x);
             yValues.push(y);
          } else {
             // Push null to break the line at undefined/infinite points
             xValues.push(x);
             yValues.push(null as any); 
          }
        } catch (e) {
          // Skip invalid points
        }
      }

      return {
        labels: xValues.map(x => x.toFixed(1)),
        datasets: [
          {
            label: `y = ${equation}`,
            data: yValues,
            borderColor: 'rgb(59, 130, 246)', // Blue-500
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderWidth: 2,
            pointRadius: 0, // Hide points for a smooth line look
            tension: 0.4, // Smooth curves
            spanGaps: false, // Don't connect lines across nulls (asymptotes)
          },
        ],
      };
    } catch (err) {
      console.error('Graph generation failed:', err);
      return null;
    }
  }, [data]);

  if (!chartData) {
    return <div style={{ color: '#ef4444', fontSize: '12px' }}>Unable to plot graph: {data}</div>;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#f3f4f6' },
        ticks: { display: true, maxTicksLimit: 10 }
      },
      y: {
        grid: { color: '#f3f4f6' },
        min: -10,
        max: 10,
      }
    },
    plugins: {
      legend: { display: true, position: 'top' as const },
      tooltip: { enabled: true }
    }
  };

  return (
    <div className="graph-container" style={{ marginTop: '12px', marginBottom: '12px', height: '250px', width: '100%' }}>
      <div style={{ height: '100%', width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>
        <Line options={options} data={chartData} />
      </div>
      {caption && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic', textAlign: 'center' }}>{caption}</div>}
    </div>
  );
};
