import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileUp, MapPin, CalendarClock, Clock3, Star, SlidersHorizontal, Hash, MessageCircleQuestion, Video, Link2 } from 'lucide-react';

const definitions: Record<string, { title: string; icon: React.ReactNode; tone: string }> = {
    file: { title: 'File', icon: <FileUp size={18} />, tone: '#f59e0b' },
    location: { title: 'Location', icon: <MapPin size={18} />, tone: '#ef4444' },
    appointment: { title: 'Appointment', icon: <CalendarClock size={18} />, tone: '#3b82f6' },
    dateTime: { title: 'Date/Time', icon: <Clock3 size={18} />, tone: '#f97316' },
    rating: { title: 'Rating', icon: <Star size={18} />, tone: '#eab308' },
    range: { title: 'Range', icon: <SlidersHorizontal size={18} />, tone: '#0ea5e9' },
    numericInput: { title: 'Numeric Input', icon: <Hash size={18} />, tone: '#0ea5e9' },
    smartQuestion: { title: 'Smart Question', icon: <MessageCircleQuestion size={18} />, tone: '#f97316' },
    video: { title: 'Video', icon: <Video size={18} />, tone: '#ef4444' },
    webLink: { title: 'Web Link', icon: <Link2 size={18} />, tone: '#16a34a' },
};

function ComponentNode({ data, type }: NodeProps & { type: string }) {
    const def = definitions[type] || definitions.smartQuestion;
    const label = String((data as any)?.label || def.title);
    return (
        <div style={{ minWidth: 230, maxWidth: 290, background: '#fff', border: '1px solid #d9dee7', borderRadius: 12, boxShadow: '0 5px 16px rgba(0,0,0,.08)', overflow: 'hidden' }}>
            <Handle type="target" position={Position.Left} style={{ background: '#94a3b8', width: 9, height: 9 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #eef1f5' }}>
                <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, background: `${def.tone}20`, color: def.tone }}>
                    {def.icon}
                </span>
                <strong style={{ fontSize: 13 }}>{def.title}</strong>
            </div>
            <div style={{ padding: 12, fontSize: 12, color: '#475569', minHeight: 42 }}>{label}</div>
            <Handle type="source" position={Position.Right} style={{ background: '#6366f1', width: 9, height: 9 }} />
        </div>
    );
}

export const FileNode = (props: NodeProps) => <ComponentNode {...props} type="file" />;
export const LocationNode = (props: NodeProps) => <ComponentNode {...props} type="location" />;
export const AppointmentNode = (props: NodeProps) => <ComponentNode {...props} type="appointment" />;
export const DateTimeNode = (props: NodeProps) => <ComponentNode {...props} type="dateTime" />;
export const RatingNode = (props: NodeProps) => <ComponentNode {...props} type="rating" />;
export const RangeNode = (props: NodeProps) => <ComponentNode {...props} type="range" />;
export const NumericInputNode = (props: NodeProps) => <ComponentNode {...props} type="numericInput" />;
export const SmartQuestionNode = (props: NodeProps) => <ComponentNode {...props} type="smartQuestion" />;
export const VideoNode = (props: NodeProps) => <ComponentNode {...props} type="video" />;
export const WebLinkNode = (props: NodeProps) => <ComponentNode {...props} type="webLink" />;
