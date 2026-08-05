import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquare, UserPlus, Globe, List, Code, Phone, Mail, User, HelpCircle, Sparkles, CheckSquare, Database, Image as ImageIcon } from 'lucide-react';

const NodeWrapper = ({ children, selected, color, icon: Icon, title, data }: any) => (
  <div className={`min-w-[220px] bg-white rounded-xl shadow-lg border-2 transition-all ${selected ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-gray-100'}`}>
    <div className={`p-3 rounded-t-lg flex items-center gap-2 border-b ${color}`}>
      <div className="p-1.5 bg-white/20 rounded-md">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <span className="text-[10px] font-bold text-white uppercase tracking-wider">{title}</span>
    </div>
    <div className="p-4">
      {children}
    </div>
    {data?.nextStepId && (
      <div className="px-3 py-1.5 bg-indigo-50/80 border-t border-indigo-100 rounded-b-xl flex items-center justify-between text-[9px] font-bold text-indigo-700">
        <span>Next Step:</span>
        <span>{data.nextStepId === 'END' ? '🛑 End Flow' : `➜ Redirect Set`}</span>
      </div>
    )}
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-indigo-400 border-2 border-white" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-indigo-400 border-2 border-white" />
  </div>
);

export const ImageNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-purple-600" icon={ImageIcon} title="Image / Media">
    <div className="space-y-2">
      <p className="text-xs text-gray-600 font-medium">{data.label || 'Welcome Banner Image'}</p>
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="Node media" className="w-full h-24 object-cover rounded-lg border border-gray-100" />
      ) : (
        <div className="w-full h-20 bg-purple-50 rounded-lg border border-dashed border-purple-200 flex flex-col items-center justify-center text-purple-400">
          <ImageIcon className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-semibold">Image Banner</span>
        </div>
      )}
    </div>
  </NodeWrapper>
));

export const MessageNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-blue-500" icon={MessageSquare} title="Message">
    <p className="text-sm text-gray-600 line-clamp-3">{data.label || 'Type your message...'}</p>
  </NodeWrapper>
));

export const NameNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-emerald-500" icon={User} title="Name">
    <p className="text-xs text-gray-500 italic">Asking for user's name...</p>
  </NodeWrapper>
));

export const PhoneNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-teal-500" icon={Phone} title="Phone Number">
    <p className="text-xs text-gray-500 italic">Asking for phone number...</p>
  </NodeWrapper>
));

export const EmailNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-cyan-500" icon={Mail} title="Email">
    <p className="text-xs text-gray-500 italic">Asking for email address...</p>
  </NodeWrapper>
));

export const SingleChoiceNode = memo(({ data, selected }: any) => {
  const routes = data?.optionRoutes || {};
  return (
    <NodeWrapper data={data} selected={selected} color="bg-indigo-500" icon={CheckSquare} title="Single Choice">
      <div className="space-y-2">
        <p className="text-sm text-gray-600 truncate">{data.label || 'Select one:'}</p>
        <div className="flex flex-col gap-1">
          {(data.choices || ['Option']).map((c: string, i: number) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-medium rounded border border-indigo-100">
              <span className="truncate max-w-[120px]">{c}</span>
              {routes[c] ? (
                <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[8px] shrink-0 font-bold shadow-2xs">
                  ➔ next
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </NodeWrapper>
  );
});

export const MultipleChoiceNode = memo(({ data, selected }: any) => {
  const routes = data?.optionRoutes || {};
  return (
    <NodeWrapper data={data} selected={selected} color="bg-purple-500" icon={List} title="Multiple Choice">
      <div className="space-y-2">
        <p className="text-sm text-gray-600 truncate">{data.label || 'Select many:'}</p>
        <div className="flex flex-col gap-1">
          {(data.choices || ['Option']).map((c: string, i: number) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-medium rounded border border-purple-100">
              <span className="truncate max-w-[120px]">{c}</span>
              {routes[c] ? (
                <span className="ml-1 px-1.5 py-0.5 bg-purple-600 text-white rounded text-[8px] shrink-0 font-bold shadow-2xs">
                  ➔ next
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </NodeWrapper>
  );
});

export const TextQuestionNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-orange-500" icon={HelpCircle} title="Text Question">
    <p className="text-sm text-gray-600">{data.label || 'How can we help?'}</p>
    <div className="mt-2 h-6 bg-gray-50 border border-dashed border-gray-200 rounded"></div>
  </NodeWrapper>
));

export const AiResponseNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-gradient-to-r from-pink-500 to-rose-500" icon={Sparkles} title="AI Response">
    <div className="space-y-1">
      <p className="text-xs text-gray-600 font-medium">Gemini AI Engine</p>
      <p className="text-[10px] text-gray-400">Generates response based on context</p>
    </div>
  </NodeWrapper>
));

export const ApiNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-amber-500" icon={Globe} title="API Fetch">
    <div className="flex items-center gap-2 text-[10px] text-gray-600">
      <Code className="w-3 h-3" />
      <span className="truncate">{data.url || 'https://api.example.com'}</span>
    </div>
  </NodeWrapper>
));

export const SaveNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} color="bg-amber-600" icon={Database} title="Action: Save Lead">
    <div className="space-y-1">
      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-tight">Lead Checkpoint</p>
      <p className="text-[9px] text-gray-400 italic">Saves current progress to DB</p>
    </div>
  </NodeWrapper>
));
