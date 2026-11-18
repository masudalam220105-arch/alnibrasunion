'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Plus,
  Printer,
  Receipt,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  computeFinancialSummary,
  formatINR,
  getIndiaDateISO,
  getStudentFinancialProfile,
} from '@/lib/portal-logic';
import type {
  BrandingConfig,
  CustomTypeRecord,
  ExpenseRecord,
  FinancialReceiptRecord,
  IncomeRecord,
  PaymentMethodType,
  PortalDatabaseState,
  StudentContributionRecord,
  StudentDueRecord,
  UserProfile,
} from '@/lib/types';
import CustomTypeSelector from './CustomTypeSelector';
import SelectWithCustom from './SelectWithCustom';
import { OFFICIAL_ALNIBRAS_LOGO_PATH } from './OfficialBrandingView';

export type FinancialSubTab =
  | 'dashboard'
  | 'income'
  | 'expenses'
  | 'contributions'
  | 'dues'
  | 'reports';

const DEFAULT_INCOME_CATEGORIES = [
  'Student Contribution',
  'Event Fee',
  'Program Registration Fee',
  'Donation',
  'Sponsorship',
  'Union Membership Fee',
  'Special Collection',
  'Other Income',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Event Expense',
  'Program Expense',
  'Decoration',
  'Printing',
  'Food & Refreshments',
  'Sound System',
  'Stage Arrangement',
  'Guest Honorarium',
  'Certificates & Prizes',
  'Stationery',
  'Transportation',
  'Other Expense',
];

const DEFAULT_DUE_CATEGORIES = [
  'Monthly Union Fee',
  'Annual Union Fee',
  'Event Contribution',
  'Program Fee',
  'Special Collection',
  'Fine',
  'Other Due',
];

const PAYMENT_METHODS: PaymentMethodType[] = [
  'UPI',
  'Cash',
  'Bank Transfer',
  'Online Payment',
  'Other',
];

interface OfficialReceiptModalProps {
  receipt: FinancialReceiptRecord | null;
  branding?: BrandingConfig;
  onClose: () => void;
}

export function OfficialReceiptModal({
  receipt,
  branding,
  onClose,
}: OfficialReceiptModalProps) {
  if (!receipt) return null;
  const logoSrc = branding?.logoUrl || OFFICIAL_ALNIBRAS_LOGO_PATH;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07111F]/80 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#E2DDD2] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl my-auto">
        <div className="bg-[#0C1A2E] text-white px-6 py-4 flex items-center justify-between border-b border-[#C59B27]/40">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-[#E6C665]" />
            <h3 className="font-serif text-lg font-bold">
              Official AL-NIBRAS Financial Receipt ({receipt.receiptNumber})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C59B27] text-[#07111F] text-xs font-bold uppercase tracking-wider"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Receipt Sheet */}
        <div className="p-6 sm:p-8 bg-[#FDFBF7]" data-testid="official-receipt-sheet">
          <div className="border-2 border-[#0C1A2E] p-6 bg-white rounded-xl relative">
            {/* Header with Official Union Logo */}
            <div className="flex items-center justify-between border-b-2 border-[#C59B27] pb-4 mb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-xl bg-white border border-[#C59B27] p-1.5 shrink-0">
                  <img
                    src={logoSrc}
                    alt="AL-NIBRAS Official Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#0C1A2E]">
                    {branding?.unionTitle || 'AL-NIBRAS CLASS UNION'}
                  </h2>
                  <p className="text-xs font-semibold text-[#9A7515]">
                    11th Batch of DHBC · Official Treasury Secretariat
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    secretariat@alnibras-union.edu · Official INR Payment Voucher
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-md bg-[#0C1A2E] text-[#E6C665] font-mono text-xs font-bold">
                  {receipt.receiptNumber}
                </span>
                <p className="text-xs text-[#475569] mt-1 font-mono">Date: {receipt.date}</p>
              </div>
            </div>

            {/* Receipt Details Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-6">
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2DDD2]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  Received From / Payer
                </div>
                <div className="font-serif text-base font-bold text-[#0F172A] mt-0.5">
                  {receipt.studentName || receipt.payerOrPayeeName}
                </div>
                {receipt.studentId && (
                  <div className="font-mono text-[11px] text-[#9A7515]">
                    Student ID: {receipt.studentId}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-[#FEF9E7] border border-[#C59B27]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#785A0A]">
                  Amount Paid (INR)
                </div>
                <div className="font-serif text-2xl font-extrabold text-[#0C1A2E] mt-0.5">
                  {formatINR(receipt.amount)}
                </div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  Method: {receipt.paymentMethod}
                  {receipt.referenceNumber ? ` · Ref: ${receipt.referenceNumber}` : ''}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs border-t border-b border-[#E2DDD2] py-4 mb-6">
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748B]">Payment Purpose / Title:</span>
                <span className="font-bold text-[#0F172A]">{receipt.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[#64748B]">Financial Category:</span>
                <span className="font-semibold text-[#0C1A2E]">{receipt.category}</span>
              </div>
              {receipt.remarks && (
                <div className="flex justify-between">
                  <span className="font-semibold text-[#64748B]">Remarks / Notes:</span>
                  <span className="text-[#334155]">{receipt.remarks}</span>
                </div>
              )}
            </div>

            {/* Signature Footer */}
            <div className="flex items-end justify-between pt-2">
              <div className="text-[11px] text-[#64748B]">
                <div className="inline-flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified Official Treasury Receipt
                </div>
                <p className="mt-0.5">All currency values denominated in Indian Rupees (₹ INR).</p>
              </div>

              <div className="text-center">
                <div className="font-serif italic text-lg text-[#0C1A2E]">
                  {receipt.authorizedBy || 'SUPER ADMIN'}
                </div>
                <div className="border-t border-[#0C1A2E] pt-1 text-[10px] font-bold uppercase tracking-wider text-[#0C1A2E]">
                  Authorized Signatory · AL-NIBRAS
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StudentFinancialStatementViewProps {
  student: UserProfile;
  state: PortalDatabaseState;
}

export function StudentFinancialStatementView({
  student,
  state,
}: StudentFinancialStatementViewProps) {
  const [selectedReceipt, setSelectedReceipt] = useState<FinancialReceiptRecord | null>(null);
  const profile = useMemo(
    () => getStudentFinancialProfile(student.uid, state),
    [student.uid, state]
  );

  return (
    <div className="space-y-6" data-testid="student-financial-statement-view">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Total Contributions Paid
          </div>
          <div className="font-serif text-2xl font-bold text-emerald-700 mt-1">
            {formatINR(profile.totalContributionsPaid)}
          </div>
          <div className="text-xs text-[#64748B] mt-1">
            {profile.contributions.length} verified contribution(s)
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Total Dues Paid
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {formatINR(profile.totalDuesPaid)}
          </div>
          <div className="text-xs text-[#64748B] mt-1">
            Assigned: {formatINR(profile.totalDuesAssigned)}
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Remaining Pending Dues
          </div>
          <div className="font-serif text-2xl font-bold text-amber-700 mt-1">
            {formatINR(profile.totalDuesRemaining)}
          </div>
          <div className="text-xs text-[#64748B] mt-1">
            {profile.dues.filter((d) => (d.remainingAmount ?? d.remainingDue ?? 0) > 0).length} open due item(s)
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Unpaid Fines Balance
          </div>
          <div className="font-serif text-2xl font-bold text-rose-700 mt-1">
            {formatINR(profile.totalFinesUnpaid)}
          </div>
          <div className="text-xs text-[#64748B] mt-1">
            Settled Fines: {formatINR(profile.totalFinesPaid)}
          </div>
        </div>
      </div>

      {/* Assigned Dues Table */}
      <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs">
        <h3 className="font-serif text-lg font-bold text-[#0F172A] mb-4">
          Assigned Union Dues &amp; Installment Status
        </h3>
        {profile.dues.length === 0 ? (
          <p className="text-xs text-[#64748B] italic">No union dues assigned to this account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E2DDD2] text-[#64748B] uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Due Title</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Total (₹)</th>
                  <th className="py-3 px-3">Paid (₹)</th>
                  <th className="py-3 px-3">Remaining (₹)</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {profile.dues.map((due) => (
                  <tr key={due.id}>
                    <td className="py-3 px-3 font-bold text-[#0F172A]">{due.dueTitle}</td>
                    <td className="py-3 px-3">{due.dueCategory}</td>
                    <td className="py-3 px-3 font-mono font-semibold">
                      {formatINR(due.totalAmount)}
                    </td>
                    <td className="py-3 px-3 font-mono text-emerald-700 font-semibold">
                      {formatINR(due.paidAmount ?? due.amountPaid ?? 0)}
                    </td>
                    <td className="py-3 px-3 font-mono text-rose-700 font-bold">
                      {formatINR(due.remainingAmount ?? due.remainingDue ?? 0)}
                    </td>
                    <td className="py-3 px-3 font-mono">{due.dueDate}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          due.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : due.status === 'partial'
                            ? 'bg-blue-100 text-blue-800'
                            : due.status === 'overdue'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {due.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Official Receipts List */}
      <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs">
        <h3 className="font-serif text-lg font-bold text-[#0F172A] mb-4">
          Official Payment Receipts &amp; Contributions
        </h3>
        {profile.receipts.length === 0 ? (
          <p className="text-xs text-[#64748B] italic">No payment receipts recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.receipts.map((rcp) => (
              <div
                key={rcp.id}
                className="p-4 rounded-xl border border-[#E2DDD2] bg-[#FDFBF7] flex items-center justify-between gap-3"
              >
                <div>
                  <span className="font-mono text-[11px] font-bold text-[#9A7515]">
                    {rcp.receiptNumber} · {rcp.date}
                  </span>
                  <h4 className="font-serif text-sm font-bold text-[#0F172A] mt-0.5">
                    {rcp.title}
                  </h4>
                  <p className="text-xs font-bold text-emerald-700 mt-1">
                    {formatINR(rcp.amount)} ({rcp.paymentMethod})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(rcp)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-xs font-bold"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Receipt
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <OfficialReceiptModal
        receipt={selectedReceipt}
        branding={state.branding}
        onClose={() => setSelectedReceipt(null)}
      />
    </div>
  );
}

interface UnionFinancialManagementProps {
  state: PortalDatabaseState;
  initialSubTab?: FinancialSubTab;
  initialTab?: FinancialSubTab;
  onSaveIncome?: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteIncome?: (inc: IncomeRecord) => void;
  onSaveExpense?: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteExpense?: (exp: ExpenseRecord) => void;
  onSaveContribution?: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteContribution?: (c: StudentContributionRecord) => void;
  onSaveStudentDue?: (payload: Record<string, unknown>) => Promise<void>;
  onRecordDuePayment?: (payload: Record<string, unknown>) => Promise<void>;
  onDeleteStudentDue?: (d: StudentDueRecord) => void;
  onAddCustomType?: (module: string, name: string) => Promise<void>;
  onDeleteCustomType?: (id: string, name: string) => void;
  onMutate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export function UnionFinancialManagement({
  state,
  initialSubTab,
  initialTab,
  onSaveIncome,
  onDeleteIncome,
  onSaveExpense,
  onDeleteExpense,
  onSaveContribution,
  onDeleteContribution,
  onSaveStudentDue,
  onRecordDuePayment,
  onDeleteStudentDue,
  onAddCustomType,
  onDeleteCustomType,
  onMutate,
  showToast,
}: UnionFinancialManagementProps) {
  const [activeTab, setActiveTab] = useState<FinancialSubTab>(
    initialTab || initialSubTab || 'dashboard'
  );
  const [selectedReceipt, setSelectedReceipt] = useState<FinancialReceiptRecord | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState<{
    title: string;
    label: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const students = useMemo(
    () => state.users.filter((u) => u.role === 'student'),
    [state.users]
  );

  const summary = useMemo(
    () =>
      computeFinancialSummary(
        state.income || [],
        state.expenses || [],
        state.studentContributions || [],
        state.studentDues || [],
        getIndiaDateISO().slice(0, 7)
      ),
    [state.income, state.expenses, state.studentContributions, state.studentDues]
  );

  // Income Form State
  const [incTitle, setIncTitle] = useState('');
  const [incCategory, setIncCategory] = useState('Sponsorship');
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState(() => getIndiaDateISO());
  const [incReceivedFrom, setIncReceivedFrom] = useState('');
  const [incPaymentMethod, setIncPaymentMethod] = useState<PaymentMethodType>('UPI');
  const [incRef, setIncRef] = useState('');
  const [incDesc, setIncDesc] = useState('');

  // Expense Form State
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState('Program Expense');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => getIndiaDateISO());
  const [expPaidTo, setExpPaidTo] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<PaymentMethodType>('UPI');
  const [expApprovedBy, setExpApprovedBy] = useState('SUPER ADMIN');
  const [expDesc, setExpDesc] = useState('');
  const [expBillName, setExpBillName] = useState('');
  const [expBillUrl, setExpBillUrl] = useState('');

  // Student Contribution Form State
  const [cntStudentUid, setCntStudentUid] = useState(students[0]?.uid || '');
  const [cntPurpose, setCntPurpose] = useState('');
  const [cntCategory, setCntCategory] = useState('Union Membership Fee');
  const [cntAmount, setCntAmount] = useState('');
  const [cntDate, setCntDate] = useState(() => getIndiaDateISO());
  const [cntMethod, setCntMethod] = useState<PaymentMethodType>('UPI');
  const [cntRemarks, setCntRemarks] = useState('');

  // Student Due Form State
  const [dueAssignAll, setDueAssignAll] = useState(false);
  const [dueStudentUid, setDueStudentUid] = useState(students[0]?.uid || '');
  const [dueTitle, setDueTitle] = useState('');
  const [dueCategory, setDueCategory] = useState('Monthly Union Fee');
  const [dueTotalAmount, setDueTotalAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => getIndiaDateISO(new Date(Date.now() + 14 * 86400000)));
  const [dueRemarks, setDueRemarks] = useState('');

  // Partial/Full Due Payment Modal State
  const [payingDue, setPayingDue] = useState<StudentDueRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethodType>('UPI');
  const [payRemarks, setPayRemarks] = useState('');

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: incTitle,
      category: incCategory,
      amount: Number(incAmount),
      date: incDate,
      receivedFrom: incReceivedFrom,
      paymentMethod: incPaymentMethod,
      referenceNumber: incRef,
      description: incDesc,
    };
    if (onSaveIncome) {
      await onSaveIncome(payload);
    } else if (onMutate) {
      const res = await onMutate({ action: 'SAVE_INCOME', ...payload });
      if (res.ok) showToast?.('Income recorded in INR ledger.', 'success');
      else showToast?.(res.error || 'Could not record income.', 'error');
    }
    setIncTitle('');
    setIncAmount('');
    setIncReceivedFrom('');
    setIncRef('');
    setIncDesc('');
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: expTitle,
      category: expCategory,
      amount: Number(expAmount),
      date: expDate,
      paidTo: expPaidTo,
      paymentMethod: expPaymentMethod,
      approvedBy: expApprovedBy,
      description: expDesc,
      billName: expBillName || undefined,
      billUrl: expBillUrl || undefined,
    };
    if (onSaveExpense) {
      await onSaveExpense(payload);
    } else if (onMutate) {
      const res = await onMutate({ action: 'SAVE_EXPENSE', ...payload });
      if (res.ok) showToast?.('Expense voucher recorded in INR ledger.', 'success');
      else showToast?.(res.error || 'Could not record expense.', 'error');
    }
    setExpTitle('');
    setExpAmount('');
    setExpPaidTo('');
    setExpDesc('');
    setExpBillName('');
    setExpBillUrl('');
  };

  const handleCreateContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      studentUid: cntStudentUid,
      purpose: cntPurpose,
      category: cntCategory,
      amount: Number(cntAmount),
      date: cntDate,
      paymentMethod: cntMethod,
      remarks: cntRemarks,
    };
    if (onSaveContribution) {
      await onSaveContribution(payload);
    } else if (onMutate) {
      const res = await onMutate({ action: 'SAVE_STUDENT_CONTRIBUTION', ...payload });
      if (res.ok) showToast?.('Student contribution recorded & receipt issued.', 'success');
      else showToast?.(res.error || 'Could not record contribution.', 'error');
    }
    setCntPurpose('');
    setCntAmount('');
    setCntRemarks('');
  };

  const handleCreateDue = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetStudentUids = dueAssignAll
      ? students.filter((s) => s.status === 'active').map((s) => s.uid)
      : [dueStudentUid];
    const payload = {
      targetStudentUids,
      dueTitle,
      dueCategory,
      totalAmount: Number(dueTotalAmount),
      dueDate,
      remarks: dueRemarks,
    };
    if (onSaveStudentDue) {
      await onSaveStudentDue(payload);
    } else if (onMutate) {
      const res = await onMutate({ action: 'SAVE_STUDENT_DUE', ...payload });
      if (res.ok) showToast?.('Student due assigned.', 'success');
      else showToast?.(res.error || 'Could not assign student due.', 'error');
    }
    setDueTitle('');
    setDueTotalAmount('');
    setDueRemarks('');
  };

  const handleConfirmDuePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDue) return;
    const payload = {
      dueId: payingDue.id,
      amount: Number(payAmount),
      date: getIndiaDateISO(),
      paymentMethod: payMethod,
      remarks: payRemarks,
    };
    if (onRecordDuePayment) {
      await onRecordDuePayment(payload);
    } else if (onMutate) {
      const res = await onMutate({ action: 'RECORD_DUE_PAYMENT', ...payload });
      if (res.ok) showToast?.('Due payment recorded & INR receipt issued.', 'success');
      else showToast?.(res.error || 'Could not record payment.', 'error');
    }
    setPayingDue(null);
    setPayAmount('');
    setPayRemarks('');
  };

  const handleAddFinCustomType = async (mod: string, name: string) => {
    if (onAddCustomType) {
      await onAddCustomType(mod, name);
    } else if (onMutate) {
      const res = await onMutate({ action: 'ADD_CUSTOM_TYPE', module: mod, name });
      if (res.ok) showToast?.(`Category "${name}" added.`, 'success');
    }
  };

  const handleDeleteFinCustomType = (id: string, name: string) => {
    if (onDeleteCustomType) {
      onDeleteCustomType(id, name);
    } else if (onMutate) {
      void onMutate({ action: 'DELETE_CUSTOM_TYPE', customTypeId: id }).then((res) => {
        if (res.ok) showToast?.(`Category "${name}" removed.`, 'success');
      });
    }
  };

  const handleExportFinancialCsv = () => {
    const rows = [
      ['Type', 'Ref/Voucher', 'Date', 'Title', 'Category', 'Party', 'Method', 'Amount (INR)'],
      ...(state.income || []).map((inc) => [
        'INCOME',
        inc.receiptNumber,
        inc.date,
        inc.title,
        inc.category,
        inc.receivedFrom,
        inc.paymentMethod,
        String(inc.amount),
      ]),
      ...(state.expenses || []).map((exp) => [
        'EXPENSE',
        exp.voucherNumber,
        exp.date,
        exp.title,
        exp.category,
        exp.paidTo,
        exp.paymentMethod,
        `-${exp.amount}`,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALNIBRAS_Financial_Ledger_INR_${getIndiaDateISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-6" data-testid="union-financial-management">
      {/* Top Header & Navigation Tabs */}
      <div className="bg-gradient-to-r from-[#0C1A2E] via-[#132642] to-[#0C1A2E] rounded-2xl p-6 text-white border border-[#C59B27]/30 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#C59B27]/20 border border-[#C59B27]/40 text-[#E6C665] text-[11px] font-bold uppercase tracking-widest mb-1">
              <IndianRupee className="w-3.5 h-3.5" /> Official AL-NIBRAS Treasury (₹ INR)
            </div>
            <h2 className="font-serif text-2xl font-bold text-white">
              Union Financial Management System
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Real-time INR accounting for Union Income, Expenses, Student Contributions, Pending
              Dues, and Official Receipts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'dashboard', label: 'Financial Dashboard' },
                { id: 'income', label: 'Income Management' },
                { id: 'expenses', label: 'Expense Management' },
                { id: 'contributions', label: 'Student Contributions' },
                { id: 'dues', label: 'Student Dues' },
                { id: 'reports', label: 'Financial Reports' },
              ] as { id: FinancialSubTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                data-testid={`fin-tab-${tab.id}`}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#C59B27] text-[#07111F] shadow-sm'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Summary Strip (Always Visible) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          data-testid="fin-kpi-income"
          className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs"
        >
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            <span>Total Union Income</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-serif text-2xl font-extrabold text-emerald-700 mt-1.5">
            {formatINR(summary.totalIncome)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">
            {(state.income || []).length} verified credit entries
          </div>
        </div>

        <div
          data-testid="fin-kpi-expenses"
          className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs"
        >
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            <span>Total Union Expenses</span>
            <ArrowDownRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="font-serif text-2xl font-extrabold text-rose-700 mt-1.5">
            {formatINR(summary.totalExpenses)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">
            {(state.expenses || []).length} verified voucher entries
          </div>
        </div>

        <div
          data-testid="fin-kpi-balance"
          className="bg-[#0C1A2E] text-white border border-[#C59B27]/50 rounded-2xl p-5 shadow-md"
        >
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#E6C665]">
            <span>Current Union Balance</span>
            <Wallet className="w-4 h-4 text-[#E6C665]" />
          </div>
          <div className="font-serif text-2xl font-extrabold text-white mt-1.5">
            {formatINR(summary.currentBalance)}
          </div>
          <div className="text-[11px] text-slate-300 mt-1">
            Net Verified Treasury Reserve (INR)
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            <span>Student Contributions</span>
            <TrendingUp className="w-4 h-4 text-[#9A7515]" />
          </div>
          <div className="font-serif text-2xl font-extrabold text-[#0C1A2E] mt-1.5">
            {formatINR(summary.totalStudentContributions)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">
            {(state.studentContributions || []).length} member receipts
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            <span>Pending Student Dues</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-serif text-2xl font-extrabold text-amber-700 mt-1.5">
            {formatINR(summary.pendingStudentDues)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">
            Excluded from cash balance until paid
          </div>
        </div>
      </div>

      {/* TAB 1: FINANCIAL DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Breakdown */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              Income &amp; Expense Breakdown by Category (₹ INR)
            </h3>

            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Income Sources
              </div>
              {Object.entries(summary.incomeByCategory).map(([cat, val]) => (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{cat}</span>
                    <span className="font-mono font-bold text-emerald-700">{formatINR(val)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((val / Math.max(1, summary.totalIncome)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-4 border-t border-[#E2DDD2]">
              <div className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Expense Allocations
              </div>
              {Object.entries(summary.expenseByCategory).map(([cat, val]) => (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{cat}</span>
                    <span className="font-mono font-bold text-rose-700">{formatINR(val)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-600 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((val / Math.max(1, summary.totalExpenses)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Official Receipts & Audit Trail */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold text-[#0F172A]">
                Recent Official Receipts &amp; Treasury Vouchers
              </h3>
              <button
                type="button"
                onClick={handleExportFinancialCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            <div className="space-y-2.5">
              {(state.financialReceipts || []).slice(0, 6).map((rcp) => (
                <div
                  key={rcp.id}
                  className="p-3.5 rounded-xl border border-[#E2DDD2] bg-[#FDFBF7] flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#9A7515]">
                        {rcp.receiptNumber}
                      </span>
                      <span className="text-[11px] text-[#64748B]">· {rcp.date}</span>
                    </div>
                    <div className="font-semibold text-xs text-[#0F172A] mt-0.5">{rcp.title}</div>
                    <div className="text-[11px] text-[#64748B]">
                      Payer: {rcp.payerOrPayeeName} ({rcp.paymentMethod})
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-700">
                      {formatINR(rcp.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(rcp)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-[11px] font-bold"
                    >
                      Receipt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INCOME MANAGEMENT */}
      {activeTab === 'income' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateIncome}
            className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4 h-fit"
          >
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              Record Union Income (₹ INR)
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Income Title *
              </label>
              <input
                type="text"
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
                required
                placeholder="e.g., Symposium Sponsorship Grant"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <CustomTypeSelector
              label="Income Category *"
              module="income"
              defaultOptions={DEFAULT_INCOME_CATEGORIES}
              customTypes={state.customTypes || []}
              value={incCategory}
              onChange={setIncCategory}
              onAddCustomType={(name) => handleAddFinCustomType('income', name)}
              onDeleteCustomType={handleDeleteFinCustomType}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Amount (₹ INR) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={incAmount}
                  onChange={(e) => setIncAmount(e.target.value)}
                  required
                  placeholder="5000"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Received From (Payer / Sponsor) *
              </label>
              <input
                type="text"
                value={incReceivedFrom}
                onChange={(e) => setIncReceivedFrom(e.target.value)}
                required
                placeholder="e.g., Alumni Patronage Committee"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Payment Method
                </label>
                <SelectWithCustom
                  aria-label="Income Payment Method"
                  value={incPaymentMethod}
                  onChange={(val) => setIncPaymentMethod(val as PaymentMethodType)}
                  options={PAYMENT_METHODS}
                  savedCustomOptions={(state.customTypes || [])
                    .filter((ct) => ct.module === 'paymentMethods')
                    .map((ct) => ct.name)}
                  onCustomValueCommit={(val) => handleAddFinCustomType('paymentMethods', val)}
                  customPlaceholder="Type payment method..."
                  selectClassName="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Reference / UTR No.
                </label>
                <input
                  type="text"
                  value={incRef}
                  onChange={(e) => setIncRef(e.target.value)}
                  placeholder="UPI / NEFT Ref"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Description / Notes
              </label>
              <textarea
                rows={2}
                value={incDesc}
                onChange={(e) => setIncDesc(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <button
              type="submit"
              data-testid="submit-income-btn"
              className="w-full py-2.5 rounded-xl bg-[#0C1A2E] hover:bg-[#162946] text-[#E6C665] text-xs font-bold uppercase tracking-wider shadow-sm"
            >
              Record Income &amp; Generate Receipt
            </button>
          </form>

          {/* Income Table */}
          <div className="lg:col-span-2 bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              Verified Union Income Ledger ({formatINR(summary.totalIncome)})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2DDD2] text-[#64748B] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Receipt No.</th>
                    <th className="py-3 px-3">Title &amp; Payer</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-3">Amount (₹)</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(state.income || []).map((inc) => {
                    const matchingRcp = (state.financialReceipts || []).find(
                      (r) => r.sourceRecordId === inc.id || r.receiptNumber === inc.receiptNumber
                    );
                    return (
                      <tr key={inc.id}>
                        <td className="py-3 px-3 font-mono font-bold text-[#9A7515]">
                          {inc.receiptNumber}
                          <div className="text-[10px] text-[#64748B]">{inc.date}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#0F172A]">{inc.title}</div>
                          <div className="text-[11px] text-[#64748B]">{inc.receivedFrom}</div>
                        </td>
                        <td className="py-3 px-3">{inc.category}</td>
                        <td className="py-3 px-3">{inc.paymentMethod}</td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {formatINR(inc.amount)}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5">
                          {matchingRcp && (
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(matchingRcp)}
                              className="px-2.5 py-1 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-[11px] font-bold"
                            >
                              Receipt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (onDeleteIncome) onDeleteIncome(inc);
                              else if (onMutate) {
                                setPendingDeleteConfirm({
                                  title: 'Delete Income Record',
                                  label: `${inc.title} (${formatINR(inc.amount)})`,
                                  onConfirm: async () => {
                                    const res = await onMutate({ action: 'DELETE_INCOME', id: inc.id });
                                    if (res.ok) showToast?.('Income entry deleted.', 'success');
                                  },
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                            title="Delete Income"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXPENSE MANAGEMENT */}
      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateExpense}
            className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4 h-fit"
          >
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              Record Union Expense (₹ INR)
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Expense Title *
              </label>
              <input
                type="text"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                required
                placeholder="e.g., Stage & Audio Arrangement"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <CustomTypeSelector
              label="Expense Category *"
              module="expenses"
              defaultOptions={DEFAULT_EXPENSE_CATEGORIES}
              customTypes={state.customTypes || []}
              value={expCategory}
              onChange={setExpCategory}
              onAddCustomType={(name) => handleAddFinCustomType('expenses', name)}
              onDeleteCustomType={handleDeleteFinCustomType}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Amount (₹ INR) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  required
                  placeholder="2500"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Paid To (Vendor / Recipient) *
              </label>
              <input
                type="text"
                value={expPaidTo}
                onChange={(e) => setExpPaidTo(e.target.value)}
                required
                placeholder="e.g., Malabar Sound & Stage Crafts"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Payment Method
                </label>
                <SelectWithCustom
                  aria-label="Expense Payment Method"
                  value={expPaymentMethod}
                  onChange={(val) => setExpPaymentMethod(val as PaymentMethodType)}
                  options={PAYMENT_METHODS}
                  savedCustomOptions={(state.customTypes || [])
                    .filter((ct) => ct.module === 'paymentMethods')
                    .map((ct) => ct.name)}
                  onCustomValueCommit={(val) => handleAddFinCustomType('paymentMethods', val)}
                  customPlaceholder="Type payment method..."
                  selectClassName="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Approved By
                </label>
                <input
                  type="text"
                  value={expApprovedBy}
                  onChange={(e) => setExpApprovedBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Description / Voucher Details
              </label>
              <textarea
                rows={2}
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <button
              type="submit"
              data-testid="submit-expense-btn"
              className="w-full py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold uppercase tracking-wider shadow-sm"
            >
              Record Expense Voucher
            </button>
          </form>

          {/* Expenses Table */}
          <div className="lg:col-span-2 bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              Verified Union Expense Ledger ({formatINR(summary.totalExpenses)})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2DDD2] text-[#64748B] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Voucher No.</th>
                    <th className="py-3 px-3">Expense Title &amp; Vendor</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Approved By</th>
                    <th className="py-3 px-3">Amount (₹)</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(state.expenses || []).map((exp) => (
                    <tr key={exp.id}>
                      <td className="py-3 px-3 font-mono font-bold text-[#0C1A2E]">
                        {exp.voucherNumber}
                        <div className="text-[10px] text-[#64748B]">{exp.date}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#0F172A]">{exp.title}</div>
                        <div className="text-[11px] text-[#64748B]">Paid to: {exp.paidTo}</div>
                      </td>
                      <td className="py-3 px-3">{exp.category}</td>
                      <td className="py-3 px-3">{exp.approvedBy}</td>
                      <td className="py-3 px-3 font-mono font-bold text-rose-700">
                        {formatINR(exp.amount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (onDeleteExpense) onDeleteExpense(exp);
                            else if (onMutate) {
                              setPendingDeleteConfirm({
                                title: 'Delete Expense Voucher',
                                label: `${exp.title} (${formatINR(exp.amount)})`,
                                onConfirm: async () => {
                                  const res = await onMutate({ action: 'DELETE_EXPENSE', id: exp.id });
                                  if (res.ok) showToast?.('Expense voucher deleted.', 'success');
                                },
                              });
                            }
                          }}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STUDENT CONTRIBUTIONS */}
      {activeTab === 'contributions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateContribution}
            className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4 h-fit"
          >
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              Record Student Contribution (₹ INR)
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Select Student Member *
              </label>
              <SelectWithCustom
                aria-label="Select Student Member"
                value={cntStudentUid}
                onChange={setCntStudentUid}
                options={students.map((st) => ({
                  value: st.uid,
                  label: `${st.fullName} (${st.studentId})`,
                }))}
                customPlaceholder="Type student UID..."
                selectClassName="w-full px-3 py-2.5 rounded-xl border border-[#CBD5E1] text-sm bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Contribution Purpose *
              </label>
              <input
                type="text"
                value={cntPurpose}
                onChange={(e) => setCntPurpose(e.target.value)}
                required
                placeholder="e.g., Annual Symposium & Union Membership"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Amount (₹ INR) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={cntAmount}
                  onChange={(e) => setCntAmount(e.target.value)}
                  required
                  placeholder="1500"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Payment Method
                </label>
                <SelectWithCustom
                  aria-label="Contribution Payment Method"
                  value={cntMethod}
                  onChange={(val) => setCntMethod(val as PaymentMethodType)}
                  options={PAYMENT_METHODS}
                  savedCustomOptions={(state.customTypes || [])
                    .filter((ct) => ct.module === 'paymentMethods')
                    .map((ct) => ct.name)}
                  onCustomValueCommit={(val) => handleAddFinCustomType('paymentMethods', val)}
                  customPlaceholder="Type payment method..."
                  selectClassName="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Remarks
              </label>
              <input
                type="text"
                value={cntRemarks}
                onChange={(e) => setCntRemarks(e.target.value)}
                placeholder="Optional receipt note..."
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <button
              type="submit"
              data-testid="submit-contribution-btn"
              className="w-full py-2.5 rounded-xl bg-[#0C1A2E] text-[#E6C665] text-xs font-bold uppercase tracking-wider"
            >
              Record Contribution &amp; Issue Receipt
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              Student Contributions Register ({formatINR(summary.totalStudentContributions)})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2DDD2] text-[#64748B] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Receipt No.</th>
                    <th className="py-3 px-3">Student</th>
                    <th className="py-3 px-3">Purpose</th>
                    <th className="py-3 px-3">Amount (₹)</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(state.studentContributions || []).map((cnt) => {
                    const matchingRcp = (state.financialReceipts || []).find(
                      (r) => r.sourceRecordId === cnt.id || r.receiptNumber === cnt.receiptNumber
                    );
                    return (
                      <tr key={cnt.id}>
                        <td className="py-3 px-3 font-mono font-bold text-[#9A7515]">
                          {cnt.receiptNumber}
                          <div className="text-[10px] text-[#64748B]">{cnt.date}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#0F172A]">{cnt.studentName}</div>
                          <div className="font-mono text-[11px] text-[#64748B]">{cnt.studentId}</div>
                        </td>
                        <td className="py-3 px-3">{cnt.purpose}</td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {formatINR(cnt.amount)}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5">
                          {matchingRcp && (
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(matchingRcp)}
                              className="px-2.5 py-1 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-[11px] font-bold"
                            >
                              Receipt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (onDeleteContribution) onDeleteContribution(cnt);
                              else if (onMutate) {
                                setPendingDeleteConfirm({
                                  title: 'Delete Student Contribution',
                                  label: `${cnt.studentName} · ${cnt.purpose}`,
                                  onConfirm: async () => {
                                    const res = await onMutate({
                                      action: 'DELETE_STUDENT_CONTRIBUTION',
                                      id: cnt.id,
                                    });
                                    if (res.ok) showToast?.('Contribution deleted.', 'success');
                                  },
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                            title="Delete Contribution"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STUDENT DUES */}
      {activeTab === 'dues' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateDue}
            className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4 h-fit"
          >
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              Assign Student Union Due (₹ INR)
            </h3>

            <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={dueAssignAll}
                onChange={(e) => setDueAssignAll(e.target.checked)}
                className="w-4 h-4 accent-[#0C1A2E] rounded"
              />
              Assign to All Active Students
            </label>

            {!dueAssignAll && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Select Student *
                </label>
                <SelectWithCustom
                  aria-label="Select Student for Due"
                  value={dueStudentUid}
                  onChange={setDueStudentUid}
                  options={students.map((st) => ({
                    value: st.uid,
                    label: `${st.fullName} (${st.studentId})`,
                  }))}
                  customPlaceholder="Type student UID..."
                  selectClassName="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm bg-white"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Due Title *
              </label>
              <input
                type="text"
                value={dueTitle}
                onChange={(e) => setDueTitle(e.target.value)}
                required
                placeholder="e.g., Monthly Union Subscription — Dec 2026"
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <CustomTypeSelector
              label="Due Category *"
              module="dues"
              defaultOptions={DEFAULT_DUE_CATEGORIES}
              customTypes={state.customTypes || []}
              value={dueCategory}
              onChange={setDueCategory}
              onAddCustomType={(name) => handleAddFinCustomType('dues', name)}
              onDeleteCustomType={handleDeleteFinCustomType}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Total Due (₹ INR) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={dueTotalAmount}
                  onChange={(e) => setDueTotalAmount(e.target.value)}
                  required
                  placeholder="500"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="submit-student-due-btn"
              className="w-full py-2.5 rounded-xl bg-[#0C1A2E] text-[#E6C665] text-xs font-bold uppercase tracking-wider"
            >
              Assign Student Due
            </button>
          </form>

          {/* Student Dues Table */}
          <div className="lg:col-span-2 bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              Student Dues &amp; Partial / Full Settlement Ledger
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2DDD2] text-[#64748B] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Student</th>
                    <th className="py-3 px-3">Due Title</th>
                    <th className="py-3 px-3">Total (₹)</th>
                    <th className="py-3 px-3">Paid (₹)</th>
                    <th className="py-3 px-3">Remaining (₹)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(state.studentDues || []).map((due) => (
                    <tr key={due.id}>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#0F172A]">{due.studentName}</div>
                        <div className="font-mono text-[11px] text-[#64748B]">{due.studentId}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#0F172A]">{due.dueTitle}</div>
                        <div className="text-[10px] text-[#64748B]">Due: {due.dueDate}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold">
                        {formatINR(due.totalAmount)}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-700 font-semibold">
                        {formatINR(due.paidAmount ?? due.amountPaid ?? 0)}
                      </td>
                      <td className="py-3 px-3 font-mono text-rose-700 font-bold">
                        {formatINR(due.remainingAmount ?? due.remainingDue ?? 0)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            due.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : due.status === 'partial'
                              ? 'bg-blue-100 text-blue-800'
                              : due.status === 'overdue'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {due.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5">
                        {(due.remainingAmount ?? due.remainingDue ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayingDue(due);
                              setPayAmount(String(due.remainingAmount ?? due.remainingDue ?? 0));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold"
                          >
                            Record Payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (onDeleteStudentDue) onDeleteStudentDue(due);
                            else if (onMutate) {
                              setPendingDeleteConfirm({
                                title: 'Delete Student Due',
                                label: `${due.studentName} · ${due.dueTitle}`,
                                onConfirm: async () => {
                                  const res = await onMutate({ action: 'DELETE_STUDENT_DUE', id: due.id });
                                  if (res.ok) showToast?.('Student due removed.', 'success');
                                },
                              });
                            }
                          }}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="Delete Due"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: FINANCIAL REPORTS */}
      {activeTab === 'reports' && (
        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2DDD2] pb-4">
            <div>
              <h3 className="font-serif text-xl font-bold text-[#0F172A]">
                Official AL-NIBRAS Financial Statement &amp; Audit Report (₹ INR)
              </h3>
              <p className="text-xs text-[#64748B]">
                Complete summary of Income, Expenses, Student Contributions, and Pending Dues.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportFinancialCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0C1A2E] text-[#E6C665] text-xs font-bold"
              >
                <FileSpreadsheet className="w-4 h-4" /> Download CSV Report
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C59B27] text-[#07111F] text-xs font-bold"
              >
                <Printer className="w-4 h-4" /> Print Financial Report
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-900">Verified Total Income</div>
              <div className="font-serif text-2xl font-extrabold text-emerald-800 mt-1">
                {formatINR(summary.totalIncome)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-xs font-bold text-rose-900">Verified Total Expenses</div>
              <div className="font-serif text-2xl font-extrabold text-rose-800 mt-1">
                {formatINR(summary.totalExpenses)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#FEF9E7] border border-[#C59B27]">
              <div className="text-xs font-bold text-[#785A0A]">Net Closing Treasury Balance</div>
              <div className="font-serif text-2xl font-extrabold text-[#0C1A2E] mt-1">
                {formatINR(summary.currentBalance)}
              </div>
            </div>
          </div>

          {/* Financial Audit Log */}
          <div>
            <h4 className="font-serif text-base font-bold text-[#0F172A] mb-3">
              Financial Audit Trail
            </h4>
            <div className="space-y-2">
              {(state.financialAuditLogs || []).map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl border border-[#E2DDD2] bg-[#F8FAFC] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-[#0C1A2E] mr-2">[{log.action}]</span>
                    <span className="text-[#334155]">{log.details}</span>
                  </div>
                  <span className="font-mono font-bold text-[#9A7515]">
                    {formatINR(log.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Record Partial / Full Due Payment Modal */}
      {payingDue && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07111F]/80 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleConfirmDuePayment}
            className="bg-white border border-[#E2DDD2] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-3">
              <h3 className="font-serif text-lg font-bold text-[#0F172A]">
                Record Due Payment (₹ INR)
              </h3>
              <button
                type="button"
                onClick={() => setPayingDue(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FDFBF7] border border-[#E2DDD2] text-xs space-y-1">
              <div className="font-bold text-[#0F172A]">{payingDue.studentName}</div>
              <div className="text-[#475569]">{payingDue.dueTitle}</div>
              <div className="font-mono font-bold text-rose-700">
                Remaining Balance: {formatINR(payingDue.remainingAmount ?? payingDue.remainingDue ?? 0)} (of{' '}
                {formatINR(payingDue.totalAmount)})
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Payment Amount (₹ INR) *
              </label>
              <input
                type="number"
                min={1}
                max={payingDue.remainingAmount ?? payingDue.remainingDue ?? 0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Payment Method
              </label>
              <SelectWithCustom
                aria-label="Due Settlement Payment Method"
                value={payMethod}
                onChange={(val) => setPayMethod(val as PaymentMethodType)}
                options={PAYMENT_METHODS}
                savedCustomOptions={(state.customTypes || [])
                  .filter((ct) => ct.module === 'paymentMethods')
                  .map((ct) => ct.name)}
                onCustomValueCommit={(val) => handleAddFinCustomType('paymentMethods', val)}
                customPlaceholder="Type payment method..."
                selectClassName="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Remarks
              </label>
              <input
                type="text"
                value={payRemarks}
                onChange={(e) => setPayRemarks(e.target.value)}
                placeholder="Installment or full settlement note..."
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingDue(null)}
                className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider"
              >
                Confirm Payment &amp; Issue Receipt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Financial Record Confirmation Modal */}
      {pendingDeleteConfirm && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-[#07111F]/80 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E2DDD2] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A]">
              {pendingDeleteConfirm.title}
            </h3>
            <p className="text-xs text-[#475569]">
              Are you sure you want to permanently remove{' '}
              <span className="font-bold text-[#0F172A]">{pendingDeleteConfirm.label}</span> from the
              AL-NIBRAS Treasury Ledger?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-semibold text-[#475569]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await pendingDeleteConfirm.onConfirm();
                  setPendingDeleteConfirm(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      <OfficialReceiptModal
        receipt={selectedReceipt}
        branding={state.branding}
        onClose={() => setSelectedReceipt(null)}
      />
    </div>
  );
}

export default UnionFinancialManagement;
