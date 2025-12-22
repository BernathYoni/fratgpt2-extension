import React from 'react';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

interface SolvelyResultProps {
  solvelyResponse: any;
}

const FinalAnswerHeader = ({ questions }: { questions: any[] }) => (
  <div className="final-answer-box mb-4 rounded-lg overflow-hidden border border-emerald-600 shadow-md">
    <div className="bg-emerald-600 text-white px-3 py-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
      <span>✨ Final Answer</span>
    </div>
    <div className="bg-slate-800 p-3">
      {questions.map((q, idx) => (
        <div key={idx} className="flex items-start gap-2 mb-1 last:mb-0">
          <span className="text-emerald-400 font-bold font-mono">{q.id}.</span>
          <span className="text-white font-medium text-lg">
            <Latex>{`$${q.final_answer.replace(/^\$|\$$/g, '')}$`}</Latex>
          </span>
        </div>
      ))}
    </div>
  </div>
);

const StepCard = ({ step, index, total }: { step: any; index: number; total: number }) => (
  <div className="step-card mb-3 relative pl-4 border-l-2 border-slate-700 last:border-transparent pb-4">
    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 border-2 border-blue-500 z-10"></div>
    <div className="bg-slate-900 rounded-lg p-3 shadow-sm border border-slate-700/50">
      <div className="text-slate-200 font-bold text-sm mb-1">{step.step_title}</div>
      <div className="text-slate-400 text-sm font-mono leading-relaxed">
        <Latex>{step.step_detail}</Latex>
      </div>
    </div>
  </div>
);

const QuestionContainer = ({ question }: { question: any }) => (
  <div className="question-container mb-6">
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className="bg-blue-600/20 text-blue-400 font-mono text-xs px-2 py-0.5 rounded border border-blue-600/30">
        {question.id}
      </div>
      <h3 className="text-slate-300 font-medium text-sm">{question.task_summary}</h3>
    </div>
    
    <div className="steps-list pl-2">
      {question.steps.map((step: any, idx: number) => (
        <StepCard key={idx} step={step} index={idx} total={question.steps.length} />
      ))}
    </div>
  </div>
);

export const SolvelyResult: React.FC<SolvelyResultProps> = ({ solvelyResponse }) => {
  if (!solvelyResponse || !solvelyResponse.questions) return null;

  return (
    <div className="solvely-result p-1">
      <FinalAnswerHeader questions={solvelyResponse.questions} />
      
      {solvelyResponse.main_explanation && (
        <div className="mb-4 text-slate-400 text-sm bg-slate-800/50 p-3 rounded border border-slate-700">
           <Latex>{solvelyResponse.main_explanation}</Latex>
        </div>
      )}

      {solvelyResponse.questions.map((q: any, idx: number) => (
        <QuestionContainer key={idx} question={q} />
      ))}
    </div>
  );
};
