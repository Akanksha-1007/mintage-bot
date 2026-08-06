import React, { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { User, Mail, Calendar, ExternalLink, Bot, Download, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Lead {
  id: string;
  flowId: string;
  flowName?: string;
  data: Record<string, any>;
  timestamp: any;
  sourceUrl?: string;
}

export default function Leads() {
  const { effectiveUserId, isAdmin, impersonatedClient } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [botNames, setBotNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const targetUserId = effectiveUserId || auth.currentUser?.uid;
    if (!targetUserId && !isAdmin) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isGlobalAdminView = isAdmin && !impersonatedClient;

    const q = isGlobalAdminView
      ? query(collection(db, 'leads'), orderBy('timestamp', 'desc'))
      : query(collection(db, 'leads'), where('ownerId', '==', targetUserId), orderBy('timestamp', 'desc'));

    const unsubscribeLeads = onSnapshot(q, async (snapshot) => {
      let firestoreLeads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];

      // Fetch server backend leads
      let serverLeads: Lead[] = [];
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            serverLeads = sData.leads.map((l: any) => ({
              id: l.id,
              flowId: l.flowId,
              flowName: l.clientName,
              data: l.data || l,
              timestamp: l.timestamp,
              sourceUrl: l.sourceUrl
            }));
          }
        }
      } catch (err) {
        console.warn('Backend leads API warning:', err);
      }

      // Merge Firestore + Server API leads without duplication
      const leadMap = new Map<string, Lead>();
      serverLeads.forEach(l => leadMap.set(l.id, l));
      firestoreLeads.forEach(l => leadMap.set(l.id, l));

      const mergedLeads = Array.from(leadMap.values());
      setLeads(mergedLeads);
      setLoading(false);

      // Fetch unique bot names for these leads
      const names: Record<string, string> = { ...botNames };
      mergedLeads.forEach(l => {
        if (l.flowId && l.flowName) {
          names[l.flowId] = l.flowName;
        }
      });

      const uniqueFlowIds = Array.from(new Set(mergedLeads.map(l => l.flowId)));
      for (const flowId of uniqueFlowIds) {
        if (!names[flowId]) {
          if (flowId.includes('risinia')) names[flowId] = 'Risinia Builders';
          else if (flowId.includes('river')) names[flowId] = 'River Scape Residences';
          else {
            try {
              const botDoc = await getDoc(doc(db, 'bot_configurations', flowId));
              if (botDoc.exists()) {
                names[flowId] = botDoc.data().name;
              }
            } catch (e) {}
          }
        }
      }
      setBotNames(names);
    }, async (error) => {
      console.warn('Leads snapshot error, fetching from server API fallback:', error);
      try {
        const url = isGlobalAdminView ? '/api/leads' : `/api/leads?ownerId=${encodeURIComponent(targetUserId)}`;
        const res = await fetch(url);
        if (res.ok) {
          const sData = await res.json();
          if (sData.success && Array.isArray(sData.leads)) {
            setLeads(sData.leads);
          }
        }
      } catch (e) {}
      setLoading(false);
    });

    return () => unsubscribeLeads();
  }, [effectiveUserId, isAdmin, impersonatedClient]);

  const exportLeads = () => {
    const headers = ['Date', 'Bot', 'Name', 'Email', 'Phone', 'Source'];
    const rows = leads.map(lead => [
      lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : '',
      botNames[lead.flowId] || 'Loading...',
      lead.data.name || '',
      lead.data.email || '',
      lead.data.phone || '',
      lead.sourceUrl || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mintage_leads_${format(new Date(), 'yyyy_MM_dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Lead Center</h2>
          <p className="text-gray-500 mt-1">View and manage all information captured by your bots.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button 
            onClick={exportLeads}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-lg shadow-gray-200"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-8 py-5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lead Source</th>
                <th className="px-8 py-5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bot Info</th>
                <th className="px-8 py-5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Extra Data</th>
                <th className="px-8 py-5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Captured At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-medium italic">
                    No leads captured yet. Your bots are ready and waiting!
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{lead.data.name || 'Anonymous'}</div>
                          <div className="text-xs text-gray-500 font-medium">{lead.data.email || lead.data.phone ||'No contact info'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg w-fit">
                        <Bot className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-tight">
                          {botNames[lead.flowId] || '...'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(lead.data)
                          .filter(([key]) => !['name', 'email'].includes(key))
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <span key={key} className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded text-gray-500 font-medium">
                              {key}: {String(value)}
                            </span>
                          ))}
                        {Object.keys(lead.data).length > 5 && <span className="text-[10px] text-gray-400 font-medium">...</span>}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">
                          {lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'MMM d, yyyy') : 'Just now'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {lead.timestamp?.toDate ? format(lead.timestamp.toDate(), 'HH:mm aaa') : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
