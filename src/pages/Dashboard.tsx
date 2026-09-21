import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Building2,
  Clock,
  Mail,
  Phone,
  User,
  Users,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Lead {
  id: string;
  ownerId?: string;
  clientId?: string;
  project?: string;
  selectedProject?: string;
  projectName?: string;
  timestamp?: any;
  createdAt?: any;
  data?: Record<string, any>;
  [key: string]: any;
}

interface ClientInfo {
  id?: string;
  uid?: string;
  name?: string;
  fullName?: string;
  email?: string;
  company?: string;
  clientId?: string;
}

function getLeadData(lead: Lead): Record<string, any> {
  if (
    lead.data &&
    typeof lead.data === 'object' &&
    !Array.isArray(lead.data)
  ) {
    return lead.data;
  }

  return lead;
}

function getLeadName(lead: Lead): string {
  const data = getLeadData(lead);

  return String(
    data.name ||
    data.Name ||
    data.fullName ||
    data.full_name ||
    data.fullname ||
    lead.name ||
    lead.Name ||
    'Anonymous lead'
  );
}

function getLeadEmail(lead: Lead): string {
  const data = getLeadData(lead);

  return String(
    data.email ||
    data.Email ||
    data.emailAddress ||
    data['Email Address'] ||
    lead.email ||
    lead.Email ||
    ''
  );
}

function getLeadPhone(lead: Lead): string {
  const data = getLeadData(lead);

  return String(
    data.phone ||
    data.Phone ||
    data.phoneNumber ||
    data['Phone Number'] ||
    data.mobile ||
    data.Mobile ||
    lead.phone ||
    lead.Phone ||
    ''
  );
}

function getLeadProject(lead: Lead): string {
  const data = getLeadData(lead);

  return String(
    lead.project ||
    lead.selectedProject ||
    lead.projectName ||
    data.project ||
    data.selectedProject ||
    data.projectName ||
    data['Project'] ||
    data['Selected Project'] ||
    ''
  );
}

function getTimestampValue(value: any): number {
  if (!value) {
    return 0;
  }

  try {
    if (typeof value?.toMillis === 'function') {
      return value.toMillis();
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate().getTime();
    }

    if (value?.seconds) {
      return Number(value.seconds) * 1000;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value).getTime();

      return Number.isNaN(parsed) ? 0 : parsed;
    }
  } catch {
    return 0;
  }

  return 0;
}

function getLeadDate(lead: Lead): string {
  const timestamp =
    lead.timestamp ||
    lead.createdAt;

  const value = getTimestampValue(timestamp);

  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const {
    user,
    clientUser,
    impersonatedClient,
    isAdmin,
    loading: authLoading,
  } = useAuth();

  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  /*
   * ============================================================
   * CLIENT IDENTIFICATION
   * ============================================================
   *
   * Normal client:
   *   clientUser.id
   *
   * Admin opening a client workspace:
   *   impersonatedClient.id
   *
   * Normal client NEVER gets to choose another client.
   */
  const client: ClientInfo | null = isAdmin
    ? (impersonatedClient as ClientInfo | null)
    : (clientUser as ClientInfo | null);

  const targetClientId =
    client?.id ||
    client?.uid ||
    client?.clientId ||
    (!isAdmin ? user?.uid : '');

  /*
   * ============================================================
   * CLIENT ROUTE PROTECTION
   * ============================================================
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }

    /*
     * Admin without selecting a client:
     * send admin back to admin dashboard.
     */
    if (isAdmin && !impersonatedClient) {
      navigate('/admin', {
        replace: true,
      });

      return;
    }

    /*
     * Normal client must have a client profile.
     */
    if (!isAdmin && !clientUser) {
      navigate('/login', {
        replace: true,
      });
    }
  }, [
    authLoading,
    isAdmin,
    impersonatedClient,
    clientUser,
    navigate,
  ]);

  /*
   * ============================================================
   * LOAD ONLY THIS CLIENT'S LEADS
   * ============================================================
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!targetClientId) {
      setLeads([]);
      setLoadingLeads(false);
      return;
    }

    setLoadingLeads(true);

    /*
     * IMPORTANT:
     *
     * We DO NOT use:
     *
     * collection(db, 'leads')
     *
     * by itself.
     *
     * We always filter by ownerId.
     */
    const leadsQuery = query(
      collection(db, 'leads'),
      where('ownerId', '==', targetClientId)
    );

    const unsubscribe = onSnapshot(
      leadsQuery,
      (snapshot) => {
        const clientLeads: Lead[] = [];

        snapshot.forEach((document) => {
          const data = document.data();

          /*
           * Second safety check.
           *
           * Even though Firestore query already filters
           * ownerId, we check again before rendering.
           */
          if (data.ownerId !== targetClientId) {
            return;
          }

          clientLeads.push({
            id: document.id,
            ...data,
          } as Lead);
        });

        /*
         * Newest first.
         */
        clientLeads.sort((a, b) => {
          const dateA = getTimestampValue(
            a.timestamp || a.createdAt
          );

          const dateB = getTimestampValue(
            b.timestamp || b.createdAt
          );

          return dateB - dateA;
        });

        setLeads(clientLeads);
        setLoadingLeads(false);
      },
      (error) => {
        console.error(
          'Unable to load client leads:',
          error
        );

        setLeads([]);
        setLoadingLeads(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [
    targetClientId,
    authLoading,
  ]);

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */
  if (authLoading) {
    return (
      <div className="centered-status">
        <p>Loading workspace…</p>
      </div>
    );
  }

  /*
   * ============================================================
   * SAFETY
   * ============================================================
   */
  if (!targetClientId) {
    return (
      <div className="centered-status">
        <p>
          No client workspace is assigned to this account.
        </p>
      </div>
    );
  }

  const clientName =
    client?.name ||
    client?.fullName ||
    'Client';

  const clientEmail =
    client?.email ||
    user?.email ||
    '';

  const clientCompany =
    client?.company ||
    '';

  /*
   * ============================================================
   * CLIENT DASHBOARD
   * ============================================================
   */
  return (
    <div className="workspace-page dashboard-page">

      {/* ========================================================
          HEADER
         ======================================================== */}

      <header className="page-heading">
        <div>
          <div className="eyebrow-row">

            <span className="eyebrow">
              Workspace overview
            </span>

            <span className="status-pill status-live">
              <span />
              Live
            </span>

          </div>

          <h1>
            {clientName}'s workspace
          </h1>

          <p>
            Manage your chatbot workspace and captured
            leads from one place.
          </p>
        </div>
      </header>

      {/* ========================================================
          CLIENT INFORMATION
         ======================================================== */}

      <section
        className="metric-grid"
        aria-label="Client information"
      >

        {/* Client */}

        <article className="metric-card">

          <div className="metric-icon">
            <User />
          </div>

          <div>
            <p>Client</p>

            <strong>
              {clientName}
            </strong>
          </div>

        </article>

        {/* Company */}

        <article className="metric-card">

          <div className="metric-icon">
            <Building2 />
          </div>

          <div>
            <p>Company</p>

            <strong>
              {clientCompany || '—'}
            </strong>
          </div>

        </article>

        {/* Email */}

        <article className="metric-card">

          <div className="metric-icon">
            <Mail />
          </div>

          <div>
            <p>Email</p>

            <strong
              style={{
                fontSize: '13px',
                wordBreak: 'break-word',
              }}
            >
              {clientEmail || '—'}
            </strong>
          </div>

        </article>

        {/* Leads */}

        <article className="metric-card">

          <div className="metric-icon">
            <Users />
          </div>

          <div>
            <p>Captured leads</p>

            <strong>
              {loadingLeads
                ? '—'
                : leads.length}
            </strong>
          </div>

        </article>

      </section>

      {/* ========================================================
          LEADS
         ======================================================== */}

      <section className="recent-panel">

        <div className="section-title-row">

          <div>
            <p className="eyebrow">
              Lead data
            </p>

            <h2>
              Your leads
            </h2>
          </div>

          <span className="text-note">
            {loadingLeads
              ? 'Loading…'
              : `${leads.length} total`}
          </span>

        </div>

        {/* Loading */}

        {loadingLeads && (
          <div className="empty-activity">

            <Clock />

            <strong>
              Loading leads…
            </strong>

            <p>
              Fetching leads from your workspace.
            </p>

          </div>
        )}

        {/* No leads */}

        {!loadingLeads &&
          leads.length === 0 && (
            <div className="empty-activity">

              <Users />

              <strong>
                No leads yet
              </strong>

              <p>
                New chatbot submissions will
                appear here.
              </p>

            </div>
          )}

        {/* Leads table */}

        {!loadingLeads &&
          leads.length > 0 && (

            <div
              style={{
                overflowX: 'auto',
                marginTop: '16px',
              }}
            >

              <table
                style={{
                  width: '100%',
                  borderCollapse:
                    'collapse',
                }}
              >

                <thead>

                  <tr
                    style={{
                      borderBottom:
                        '1px solid var(--line)',
                      textAlign:
                        'left',
                    }}
                  >

                    <th
                      style={{
                        padding:
                          '12px 10px',
                      }}
                    >
                      Date / Time
                    </th>

                    <th
                      style={{
                        padding:
                          '12px 10px',
                      }}
                    >
                      Name
                    </th>

                    <th
                      style={{
                        padding:
                          '12px 10px',
                      }}
                    >
                      Email
                    </th>

                    <th
                      style={{
                        padding:
                          '12px 10px',
                      }}
                    >
                      Phone
                    </th>

                    <th
                      style={{
                        padding:
                          '12px 10px',
                      }}
                    >
                      Project
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {leads.map((lead) => {

                    const name =
                      getLeadName(
                        lead
                      );

                    const email =
                      getLeadEmail(
                        lead
                      );

                    const phone =
                      getLeadPhone(
                        lead
                      );

                    const project =
                      getLeadProject(
                        lead
                      );

                    return (
                      <tr
                        key={lead.id}
                        style={{
                          borderBottom:
                            '1px solid var(--line-soft)',
                        }}
                      >

                        <td
                          style={{
                            padding:
                              '14px 10px',
                            whiteSpace:
                              'nowrap',
                          }}
                        >

                          <span
                            style={{
                              display:
                                'inline-flex',
                              alignItems:
                                'center',
                              gap: '6px',
                            }}
                          >

                            <Clock
                              size={14}
                            />

                            {getLeadDate(
                              lead
                            )}

                          </span>

                        </td>

                        <td
                          style={{
                            padding:
                              '14px 10px',
                            fontWeight: 600,
                          }}
                        >
                          {name}
                        </td>

                        <td
                          style={{
                            padding:
                              '14px 10px',
                          }}
                        >

                          {email ? (
                            <span
                              style={{
                                display:
                                  'inline-flex',
                                alignItems:
                                  'center',
                                gap: '6px',
                              }}
                            >

                              <Mail
                                size={14}
                              />

                              {email}

                            </span>
                          ) : (
                            '—'
                          )}

                        </td>

                        <td
                          style={{
                            padding:
                              '14px 10px',
                          }}
                        >

                          {phone ? (
                            <span
                              style={{
                                display:
                                  'inline-flex',
                                alignItems:
                                  'center',
                                gap: '6px',
                              }}
                            >

                              <Phone
                                size={14}
                              />

                              {phone}

                            </span>
                          ) : (
                            '—'
                          )}

                        </td>

                        <td
                          style={{
                            padding:
                              '14px 10px',
                          }}
                        >
                          {project || '—'}
                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

      </section>

    </div>
  );
}