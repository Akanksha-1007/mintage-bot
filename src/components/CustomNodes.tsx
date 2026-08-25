import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  CheckSquare,
  Database,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  List,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';

const NodeWrapper = ({ children, selected, tone, icon: Icon, title, data }: any) => (
  <div className={`flow-node ${selected ? 'is-selected' : ''}`}>
    <div className={`flow-node-head ${tone}`}>
      <Icon />
      <span>{title}</span>
    </div>
    <div className="flow-node-body">{children}</div>
    {data?.nextStepId && (
      <div className="flow-node-footer">
        <span>Next step</span>
        <span>{data.nextStepId === 'END' ? 'End of flow' : 'Redirect set'}</span>
      </div>
    )}
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
  </div>
);

export const ImageNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-purple" icon={ImageIcon} title="Image / media">
    <p className="node-hint">{data.label || 'Welcome banner image'}</p>
    {data.imageUrl ? (
      <img src={data.imageUrl} alt="Node media" className="node-media mt-2" />
    ) : (
      <div className="flow-node-placeholder mt-2">
        <ImageIcon />
        <span>Image banner</span>
      </div>
    )}
  </NodeWrapper>
));

export const MessageNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-blue" icon={MessageSquare} title="Message">
    <p className="line-clamp-3">{data.label || 'Type your message…'}</p>
  </NodeWrapper>
));

export const NameNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-green" icon={User} title="Name">
    <p className="node-hint">Asks the visitor for their name.</p>
  </NodeWrapper>
));

export const PhoneNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-green" icon={Phone} title="Phone number">
    <p className="node-hint">Asks the visitor for a phone number.</p>
  </NodeWrapper>
));

export const EmailNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-blue" icon={Mail} title="Email">
    <p className="node-hint">Asks the visitor for an email address.</p>
  </NodeWrapper>
));

export const SingleChoiceNode = memo(({ data, selected }: any) => {
  const routes = data?.optionRoutes || {};
  return (
    <NodeWrapper data={data} selected={selected} tone="tone-purple" icon={CheckSquare} title="Single choice">
      <p className="truncate">{data.label || 'Select one:'}</p>
      <div className="mt-2">
        {(data.choices || ['Option']).map((c: string, i: number) => (
          <div key={i} className="node-choice">
            <span className="truncate">{c}</span>
            {routes[c] ? <em>next</em> : null}
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
});

export const MultipleChoiceNode = memo(({ data, selected }: any) => {
  const routes = data?.optionRoutes || {};
  return (
    <NodeWrapper data={data} selected={selected} tone="tone-purple" icon={List} title="Multiple choice">
      <p className="truncate">{data.label || 'Select many:'}</p>
      <div className="mt-2">
        {(data.choices || ['Option']).map((c: string, i: number) => (
          <div key={i} className="node-choice">
            <span className="truncate">{c}</span>
            {routes[c] ? <em>next</em> : null}
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
});

export const TextQuestionNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-orange" icon={HelpCircle} title="Text question">
    <p>{data.label || 'How can we help?'}</p>
    <div className="flow-node-placeholder mt-2" style={{ height: '32px' }} />
  </NodeWrapper>
));

export const AiResponseNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-pink" icon={Sparkles} title="AI response">
    <p>Gemini AI engine</p>
    <p className="node-hint mt-0.5">Generates a reply from the conversation context.</p>
  </NodeWrapper>
));

export const ApiNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-yellow" icon={Globe} title="API fetch">
    <p className="node-hint truncate">{data.url || 'https://api.example.com'}</p>
  </NodeWrapper>
));

export const SaveNode = memo(({ data, selected }: any) => (
  <NodeWrapper data={data} selected={selected} tone="tone-yellow" icon={Database} title="Save lead">
    <p>Lead checkpoint</p>
    <p className="node-hint mt-0.5">Saves the current answers to your database.</p>
  </NodeWrapper>
));
