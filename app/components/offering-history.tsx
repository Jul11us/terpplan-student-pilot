"use client";

import type { OfferingHistory } from "@/lib/seat-trends";
import { formatOfferingPattern } from "@/lib/seat-trends";

type OfferingHistoryProps = {
  history: OfferingHistory;
  lang: "en" | "zh";
};

const texts = {
  en: {
    title: "Offering History",
    pattern: "Pattern",
    recentTerms: "Recent Terms",
    sections: "sections",
    seats: "seats",
    noHistory: "No historical data available",
  },
  zh: {
    title: "开课历史",
    pattern: "开课规律",
    recentTerms: "近期学期",
    sections: "节",
    seats: "座位",
    noHistory: "暂无历史数据",
  },
};

export function OfferingHistory({ history, lang }: OfferingHistoryProps) {
  const t = texts[lang];

  if (!history.terms.length) {
    return (
      <div className="offering-history empty">
        <p>{t.noHistory}</p>
      </div>
    );
  }

  const patternLabel = formatOfferingPattern(history.pattern, lang);
  const recentTerms = history.terms.slice(0, 6);

  return (
    <div className="offering-history">
      <div className="history-header">
        <h4>{t.title}</h4>
        <span className={`pattern pattern-${history.pattern}`}>
          {t.pattern}: <strong>{patternLabel}</strong>
        </span>
      </div>
      <p className="history-note">{lang === "zh" ? "仅显示 TerpPlan 已读取的学期；不能据此保证未来开课。" : "Only semesters observed by TerpPlan are listed. Future offerings may differ."}</p>

      <div className="terms-list">
        <div className="terms-header">
          <span>{t.recentTerms}</span>
        </div>
        {recentTerms.map((term) => (
          <div key={term.term} className="term-row">
            <span className="term-name">{term.termName}</span>
            <span className="term-stats">
              {term.sectionCount} {t.sections} · {term.totalSeats} {t.seats}
            </span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .offering-history {
          background: #fafafa;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem;
          margin-block: 0.75rem;
        }

        .offering-history.empty {
          padding: 2rem;
          text-align: center;
          color: #9ca3af;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .history-header h4 {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
        }

        .pattern {
          font-size: 0.8125rem;
          color: #6b7280;
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          background: #f3f4f6;
        }

        .pattern strong {
          color: #111827;
        }

        .pattern-every-fall,
        .pattern-every-spring,
        .pattern-fall-spring,
        .pattern-all-terms {
          background: #dcfce7;
        }

        .pattern-every-fall strong,
        .pattern-every-spring strong,
        .pattern-fall-spring strong,
        .pattern-all-terms strong {
          color: #166534;
        }

        .pattern-irregular {
          background: #fef3c7;
        }

        .pattern-irregular strong {
          color: #92400e;
        }

        .terms-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .history-note {
          font-size: 0.75rem;
          color: #646c68;
          margin-bottom: 0.75rem;
        }

        .terms-header {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .term-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          font-size: 0.875rem;
        }

        .term-name {
          font-weight: 500;
          color: #111827;
        }

        .term-stats {
          color: #6b7280;
          font-size: 0.8125rem;
        }

        @media (prefers-color-scheme: dark) {
          .offering-history {
            background: #1f2937;
            border-color: #374151;
          }

          .history-header h4,
          .term-name {
            color: #f9fafb;
          }

          .pattern {
            background: #374151;
            color: #9ca3af;
          }

          .pattern strong {
            color: #f9fafb;
          }

          .pattern-every-fall,
          .pattern-every-spring,
          .pattern-fall-spring,
          .pattern-all-terms {
            background: #064e3b;
          }

          .pattern-every-fall strong,
          .pattern-every-spring strong,
          .pattern-fall-spring strong,
          .pattern-all-terms strong {
            color: #6ee7b7;
          }

          .pattern-irregular {
            background: #78350f;
          }

          .pattern-irregular strong {
            color: #fde68a;
          }

          .terms-header {
            color: #9ca3af;
            border-bottom-color: #374151;
          }

          .term-stats {
            color: #9ca3af;
          }

          .history-note {
            color: #cbd5e1;
          }
        }
      `}</style>
    </div>
  );
}
