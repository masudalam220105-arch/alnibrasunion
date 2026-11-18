'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  CheckCircle2,
  Database,
  Users,
  Bell,
  Megaphone,
  Image as ImageIcon,
  Award,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  MessageSquare,
  ThumbsUp,
  Layers,
  Filter,
} from 'lucide-react';
import type { PortalDatabaseState } from '@/lib/types';
import { getIndiaDateISO } from '@/lib/portal-logic';

interface AdminExportDataViewProps {
  portalState: PortalDatabaseState;
  onNotify?: (msg: string) => void;
}

export default function AdminExportDataView({
  portalState,
  onNotify,
}: AdminExportDataViewProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lastExported, setLastExported] = useState<string | null>(null);

  const inDateRange = (isoOrDateStr?: string): boolean => {
    if (!dateFrom && !dateTo) return true;
    const raw = String(isoOrDateStr || '').slice(0, 10);
    if (!raw) return true;
    if (dateFrom && raw < dateFrom) return false;
    if (dateTo && raw > dateTo) return false;
    return true;
  };

  // Sheet Builders for all 19 individual datasets
  const getStudentRecordsRows = () =>
    (portalState.users || [])
      .filter((u) => u.role === 'student' && inDateRange(u.createdAt))
      .map((u, idx) => ({
        'SL No': idx + 1,
        'Full Name': u.fullName,
        'Student ID': u.studentId,
        'Roll Number': u.rollNumber,
        'Class / Batch': u.classInfo || u.department || '11th Batch of DHBC',
        'Phone Number': u.contactPhone || '',
        'Email Address': u.contactEmail || '',
        'Village / Area': u.address?.villageArea || '',
        'Post Office': u.address?.postOffice || '',
        'Police Station': u.address?.policeStation || '',
        District: u.address?.district || '',
        State: u.address?.state || '',
        'PIN Code': u.address?.pinCode || '',
        Country: u.address?.country || 'India',
        Status: u.status.toUpperCase(),
        'Created Date': String(u.createdAt || '').slice(0, 10),
      }));

  const getStudentAccountsRows = () =>
    (portalState.users || [])
      .filter((u) => u.role === 'student' && inDateRange(u.createdAt))
      .map((u, idx) => ({
        'SL No': idx + 1,
        UID: u.uid,
        Username: u.username,
        'Full Name': u.fullName,
        'Student ID': u.studentId,
        'Roll Number': u.rollNumber,
        Role: u.role.toUpperCase(),
        'Account Status': u.status.toUpperCase(),
        'Contact Phone': u.contactPhone || '',
        'Contact Email': u.contactEmail || '',
        'Created At': u.createdAt,
        'Updated At': u.updatedAt,
      }));

  const getNoticesRows = () =>
    (portalState.notices || [])
      .filter((n) => inDateRange(n.createdAt))
      .map((n, idx) => ({
        'SL No': idx + 1,
        'Reference Code': n.referenceCode,
        Title: n.title,
        Category: n.category || 'Official Notice',
        'Effective Date': n.effectiveDate,
        Status: n.status.toUpperCase(),
        'Visible on Public Homepage': n.showOnHomepage !== false ? 'YES' : 'NO',
        Content: n.content,
        'Published Date': String(n.createdAt || '').slice(0, 10),
      }));

  const getAnnouncementsRows = () =>
    (portalState.announcements || [])
      .filter((a) => inDateRange(a.createdAt))
      .map((a, idx) => ({
        'SL No': idx + 1,
        Title: a.title,
        Category: a.category,
        Priority: (a.priority || 'normal').toUpperCase(),
        Status: a.status.toUpperCase(),
        'Author Name': a.authorName,
        Content: a.content,
        'Created Date': String(a.createdAt || '').slice(0, 10),
      }));

  const getCalendarRows = () =>
    (portalState.calendarEvents || [])
      .filter((c) => inDateRange(c.startDate || c.createdAt))
      .map((c, idx) => ({
        'SL No': idx + 1,
        Title: c.title,
        Category: c.category,
        'Start Date': c.startDate,
        'End Date': c.endDate,
        'Start Time': c.startTime || 'All Day',
        'End Time': c.endTime || 'All Day',
        Location: c.location,
        Visibility: c.visibility.toUpperCase(),
        Description: c.description,
      }));

  const getPublicPhotoGalleryRows = () =>
    (portalState.gallery || [])
      .filter((g) => (g.destination || 'public') === 'public' && inDateRange(g.createdAt))
      .map((g, idx) => ({
        'SL No': idx + 1,
        Title: g.title,
        Category: g.category,
        Destination: 'PUBLIC PAGE',
        Status: g.status.toUpperCase(),
        Caption: g.caption,
        'Image URL': g.imageUrl.startsWith('data:') ? '[Uploaded Data Image]' : g.imageUrl,
        'Uploaded Date': String(g.createdAt || '').slice(0, 10),
      }));

  const getUserPhotoGalleryRows = () =>
    (portalState.gallery || [])
      .filter((g) => g.destination === 'user' && inDateRange(g.createdAt))
      .map((g, idx) => ({
        'SL No': idx + 1,
        Title: g.title,
        Category: g.category,
        Destination: 'USER PANEL',
        Status: g.status.toUpperCase(),
        Caption: g.caption,
        'Image URL': g.imageUrl.startsWith('data:') ? '[Uploaded Data Image]' : g.imageUrl,
        'Uploaded Date': String(g.createdAt || '').slice(0, 10),
      }));

  const getCommitteeMembersRows = () =>
    (portalState.committeeMembers || [])
      .filter((m) => inDateRange(m.createdAt))
      .map((m, idx) => ({
        'SL No': idx + 1,
        'Full Name': m.fullName,
        Designation: m.designation,
        'Role Wing': m.roleCategory,
        'Class / Department': m.department,
        Session: m.batch,
        'Phone Number': m.contactPhone || '',
        Email: m.contactEmail || '',
        'Shown on Homepage': m.showOnHomepage ? 'YES' : 'NO',
      }));

  const getProgramResultsRows = () =>
    (portalState.studentResults || [])
      .filter((r) => inDateRange(r.programDate || r.createdAt))
      .map((r, idx) => ({
        'SL No': idx + 1,
        'Program Name': r.programName,
        Category: r.programCategory,
        'Program Date': r.programDate,
        'Student Name': r.studentName,
        'Student ID': r.studentId,
        Position: r.position,
        Grade: r.grade,
        'Position Points': r.positionPoints,
        'Grade Points': r.gradePoints,
        'Total Points': r.totalPoints,
        'Certificate ID': r.certificateId || '',
        Status: r.status.toUpperCase(),
      }));

  const getFineRecordsRows = () =>
    (portalState.fines || [])
      .filter((f) => inDateRange(f.issueDate || f.createdAt))
      .map((f, idx) => ({
        'SL No': idx + 1,
        'Student Name': f.studentName,
        'Roll Number': f.studentRoll,
        'Fine Reason / Title': f.title,
        Category: f.category,
        'Fine Amount (INR)': f.amount,
        'Payment Status': f.status.toUpperCase(),
        'Issue Date': f.issueDate,
        'Due Date': f.dueDate,
        'Paid Date': f.paidAt ? String(f.paidAt).slice(0, 10) : '',
        Remarks: f.description,
      }));

  const getUnionIncomeRows = () =>
    (portalState.income || [])
      .filter((inc) => inDateRange(inc.date || inc.createdAt))
      .map((inc, idx) => ({
        'SL No': idx + 1,
        'Receipt Number': inc.receiptNumber || '',
        Date: inc.date,
        Title: inc.title,
        Category: inc.category,
        'Amount (INR)': inc.amount,
        'Received From': inc.receivedFrom,
        'Payment Method': inc.paymentMethod,
        'Reference Number': inc.referenceNumber || '',
        Description: inc.description,
      }));

  const getUnionExpensesRows = () =>
    (portalState.expenses || [])
      .filter((exp) => inDateRange(exp.date || exp.createdAt))
      .map((exp, idx) => ({
        'SL No': idx + 1,
        'Voucher Number': exp.voucherNumber || '',
        Date: exp.date,
        Title: exp.title,
        Category: exp.category,
        'Amount (INR)': exp.amount,
        'Paid To': exp.paidTo,
        'Payment Method': exp.paymentMethod,
        'Approved By': exp.approvedBy,
        'Reference Number': exp.referenceNumber || '',
        Description: exp.description,
      }));

  const getFinancialTransactionsRows = () => {
    const incomeTx = (portalState.income || [])
      .filter((inc) => inDateRange(inc.date || inc.createdAt))
      .map((inc) => ({
        Date: inc.date,
        'Transaction Type': 'INCOME',
        'Receipt / Voucher': inc.receiptNumber || inc.id,
        Title: inc.title,
        Category: inc.category,
        'Amount (INR)': inc.amount,
        'Counterparty (From / To)': inc.receivedFrom,
        'Payment Method': inc.paymentMethod,
        'Recorded By': inc.createdBy,
        Description: inc.description,
      }));

    const expenseTx = (portalState.expenses || [])
      .filter((exp) => inDateRange(exp.date || exp.createdAt))
      .map((exp) => ({
        Date: exp.date,
        'Transaction Type': 'EXPENSE',
        'Receipt / Voucher': exp.voucherNumber || exp.id,
        Title: exp.title,
        Category: exp.category,
        'Amount (INR)': -Math.abs(exp.amount),
        'Counterparty (From / To)': exp.paidTo,
        'Payment Method': exp.paymentMethod,
        'Recorded By': exp.approvedBy || exp.createdBy,
        Description: exp.description,
      }));

    return [...incomeTx, ...expenseTx].sort((a, b) =>
      String(b.Date).localeCompare(String(a.Date))
    );
  };

  const getMessagesRows = () =>
    (portalState.messages || [])
      .filter((m) => inDateRange(m.createdAt))
      .map((m, idx) => ({
        'SL No': idx + 1,
        'Sender Name': m.senderName,
        Subject: m.subject,
        Message: m.body,
        Status: m.status.toUpperCase(),
        'Admin Reply': m.replyText || '',
        Date: String(m.createdAt || '').slice(0, 10),
      }));

  const getNotificationsRows = () =>
    (portalState.notifications || [])
      .filter((n) => inDateRange(n.createdAt))
      .map((n, idx) => ({
        'SL No': idx + 1,
        Recipient: n.recipientId,
        Type: n.type.toUpperCase(),
        Title: n.title,
        Message: n.message,
        Date: String(n.createdAt || '').slice(0, 10),
      }));

  const getFeedbackRows = () =>
    (portalState.feedback || [])
      .filter((f) => inDateRange(f.createdAt))
      .map((f, idx) => ({
        'SL No': idx + 1,
        'Student Name': f.studentName,
        'Student ID': f.studentId,
        Category: f.category,
        Subject: f.subject,
        Message: f.message,
        'Rating (1-5)': f.rating,
        Status: f.status.toUpperCase(),
        'Admin Response': f.adminResponse || '',
        Date: String(f.createdAt || '').slice(0, 10),
      }));

  const downloadSingleSheetWorkbook = (
    rows: Record<string, unknown>[],
    sheetName: string,
    fileName: string,
    label: string
  ) => {
    const wb = XLSX.utils.book_new();
    const safeRows =
      rows.length > 0
        ? rows
        : [{ Info: `No ${label} records found for the selected filter criteria.` }];
    const ws = XLSX.utils.json_to_sheet(safeRows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, fileName);
    setLastExported(`${label} (${rows.length} records) -> ${fileName}`);
    if (onNotify) {
      onNotify(`Exported ${label} to ${fileName}`);
    }
  };

  const downloadCompleteWebsiteWorkbook = () => {
    const wb = XLSX.utils.book_new();
    const sheets: Array<{ name: string; rows: Record<string, unknown>[] }> = [
      { name: '1_Student_Records', rows: getStudentRecordsRows() },
      { name: '2_Student_Accounts', rows: getStudentAccountsRows() },
      { name: '3_Notices', rows: getNoticesRows() },
      { name: '4_Announcements', rows: getAnnouncementsRows() },
      { name: '5_Calendar', rows: getCalendarRows() },
      { name: '6_Public_Photos', rows: getPublicPhotoGalleryRows() },
      { name: '7_User_Photos', rows: getUserPhotoGalleryRows() },
      { name: '8_Committee', rows: getCommitteeMembersRows() },
      { name: '9_Program_Results', rows: getProgramResultsRows() },
      { name: '10_Fine_Records', rows: getFineRecordsRows() },
      { name: '11_Union_Income', rows: getUnionIncomeRows() },
      { name: '12_Union_Expenses', rows: getUnionExpensesRows() },
      { name: '13_Financial_Tx', rows: getFinancialTransactionsRows() },
      { name: '14_Messages', rows: getMessagesRows() },
      { name: '15_Notifications', rows: getNotificationsRows() },
      { name: '16_Feedback', rows: getFeedbackRows() },
    ];

    sheets.forEach(({ name, rows }) => {
      const safeRows = rows.length > 0 ? rows : [{ Status: 'Empty Dataset' }];
      const ws = XLSX.utils.json_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });

    const fileName = `Al_Nibras_Complete_Website_Data_${getIndiaDateISO()}.xlsx`;
    XLSX.writeFile(wb, fileName);
    setLastExported(`Complete Website Data (16 Worksheets) -> ${fileName}`);
    if (onNotify) {
      onNotify(`Exported Complete Website Data (all 16 worksheets) to ${fileName}`);
    }
  };

  const exportItems = [
    {
      id: 'student_records',
      number: 1,
      title: 'Export Student Records',
      subtitle: 'Academic profile, ID, Roll Number, contact & address directory',
      count: getStudentRecordsRows().length,
      icon: Users,
      action: () =>
        downloadSingleSheetWorkbook(
          getStudentRecordsRows(),
          'Student Records',
          'Al_Nibras_Student_Records.xlsx',
          'Student Records'
        ),
    },
    {
      id: 'student_accounts',
      number: 2,
      title: 'Export Student Accounts',
      subtitle: 'Portal login usernames, UIDs, roles, and account statuses',
      count: getStudentAccountsRows().length,
      icon: Database,
      action: () =>
        downloadSingleSheetWorkbook(
          getStudentAccountsRows(),
          'Student Accounts',
          'Al_Nibras_Student_Accounts.xlsx',
          'Student Accounts'
        ),
    },
    {
      id: 'notices',
      number: 3,
      title: 'Export Notices',
      subtitle: 'Official circulars, reference codes, and effective dates',
      count: getNoticesRows().length,
      icon: Bell,
      action: () =>
        downloadSingleSheetWorkbook(
          getNoticesRows(),
          'Notices',
          'Al_Nibras_Notices.xlsx',
          'Notices'
        ),
    },
    {
      id: 'announcements',
      number: 4,
      title: 'Export Announcements',
      subtitle: 'Union announcements, priority levels, and publication records',
      count: getAnnouncementsRows().length,
      icon: Megaphone,
      action: () =>
        downloadSingleSheetWorkbook(
          getAnnouncementsRows(),
          'Announcements',
          'Al_Nibras_Announcements.xlsx',
          'Announcements'
        ),
    },
    {
      id: 'calendar',
      number: 5,
      title: 'Export Calendar',
      subtitle: 'Academic and institutional calendar dates and schedules',
      count: getCalendarRows().length,
      icon: Calendar,
      action: () =>
        downloadSingleSheetWorkbook(
          getCalendarRows(),
          'Calendar',
          'Al_Nibras_Calendar.xlsx',
          'Calendar'
        ),
    },
    {
      id: 'public_photo_gallery',
      number: 6,
      title: 'Export Public Photo Gallery',
      subtitle: 'Photographs published to the public homepage gallery',
      count: getPublicPhotoGalleryRows().length,
      icon: ImageIcon,
      action: () =>
        downloadSingleSheetWorkbook(
          getPublicPhotoGalleryRows(),
          'Public Photos',
          'Al_Nibras_Public_Photo_Gallery.xlsx',
          'Public Photo Gallery'
        ),
    },
    {
      id: 'user_photo_gallery',
      number: 7,
      title: 'Export User Photo Gallery',
      subtitle: 'Internal student union photographs restricted to the User Panel',
      count: getUserPhotoGalleryRows().length,
      icon: ImageIcon,
      action: () =>
        downloadSingleSheetWorkbook(
          getUserPhotoGalleryRows(),
          'User Photos',
          'Al_Nibras_User_Photo_Gallery.xlsx',
          'User Photo Gallery'
        ),
    },
    {
      id: 'committee_members',
      number: 8,
      title: 'Export Committee Members',
      subtitle: 'Executive and advisory union office bearers directory',
      count: getCommitteeMembersRows().length,
      icon: Users,
      action: () =>
        downloadSingleSheetWorkbook(
          getCommitteeMembersRows(),
          'Committee Members',
          'Al_Nibras_Committee_Members.xlsx',
          'Committee Members'
        ),
    },
    {
      id: 'program_results',
      number: 12,
      title: 'Export Program Results',
      subtitle: 'Competition winners, positions, grades, points, and certificates',
      count: getProgramResultsRows().length,
      icon: Award,
      action: () =>
        downloadSingleSheetWorkbook(
          getProgramResultsRows(),
          'Program Results',
          'Al_Nibras_Program_Results.xlsx',
          'Program Results'
        ),
    },
    {
      id: 'fine_records',
      number: 13,
      title: 'Export Fine Records',
      subtitle: 'Assigned student fines, amounts, due dates, and payment status',
      count: getFineRecordsRows().length,
      icon: AlertCircle,
      action: () =>
        downloadSingleSheetWorkbook(
          getFineRecordsRows(),
          'Fine Records',
          'Al_Nibras_Fine_Records.xlsx',
          'Fine Records'
        ),
    },
    {
      id: 'union_income',
      number: 14,
      title: 'Export Union Income',
      subtitle: 'All recorded union income entries, receipts, and payers',
      count: getUnionIncomeRows().length,
      icon: TrendingUp,
      action: () =>
        downloadSingleSheetWorkbook(
          getUnionIncomeRows(),
          'Union Income',
          'Al_Nibras_Union_Income.xlsx',
          'Union Income'
        ),
    },
    {
      id: 'union_expenses',
      number: 15,
      title: 'Export Union Expenses',
      subtitle: 'All union expenditures, vouchers, vendors, and approvals',
      count: getUnionExpensesRows().length,
      icon: TrendingDown,
      action: () =>
        downloadSingleSheetWorkbook(
          getUnionExpensesRows(),
          'Union Expenses',
          'Al_Nibras_Union_Expenses.xlsx',
          'Union Expenses'
        ),
    },
    {
      id: 'financial_transactions',
      number: 16,
      title: 'Export Financial Transactions',
      subtitle: 'Consolidated ledger of all union income and expense transactions',
      count: getFinancialTransactionsRows().length,
      icon: Wallet,
      action: () =>
        downloadSingleSheetWorkbook(
          getFinancialTransactionsRows(),
          'Financial Transactions',
          'Al_Nibras_Financial_Transactions.xlsx',
          'Financial Transactions'
        ),
    },
    {
      id: 'messages',
      number: 17,
      title: 'Export Messages',
      subtitle: 'Direct messages and public inquiries with admin responses',
      count: getMessagesRows().length,
      icon: MessageSquare,
      action: () =>
        downloadSingleSheetWorkbook(
          getMessagesRows(),
          'Messages',
          'Al_Nibras_Messages.xlsx',
          'Messages'
        ),
    },
    {
      id: 'notifications',
      number: 18,
      title: 'Export Notifications',
      subtitle: 'System and administrative notifications log',
      count: getNotificationsRows().length,
      icon: Bell,
      action: () =>
        downloadSingleSheetWorkbook(
          getNotificationsRows(),
          'Notifications',
          'Al_Nibras_Notifications.xlsx',
          'Notifications'
        ),
    },
    {
      id: 'feedback',
      number: 19,
      title: 'Export Feedback',
      subtitle: 'Student feedback submissions, ratings, and administrative resolutions',
      count: getFeedbackRows().length,
      icon: ThumbsUp,
      action: () =>
        downloadSingleSheetWorkbook(
          getFeedbackRows(),
          'Feedback',
          'Al_Nibras_Feedback.xlsx',
          'Feedback'
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Master Export Card */}
      <div className="bg-gradient-to-r from-[#064E3B] to-[#0B3D32] rounded-xl p-6 text-white shadow-md border border-[#D4AF37]/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/10 text-[#D4AF37] text-xs font-bold uppercase tracking-wider mb-2">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Official Excel (.XLSX) Data Export Center
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Export Data & Institutional Spreadsheets
            </h2>
            <p className="text-sm text-white/80 mt-1 max-w-2xl">
              Download formatted Microsoft Excel (.xlsx) spreadsheets for any individual portal module or export the entire Al-Nibras database into a multi-worksheet master workbook.
            </p>
          </div>

          <button
            type="button"
            onClick={downloadCompleteWebsiteWorkbook}
            className="hover-lift hover-shine press-scale inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#c29d2f] text-[#071713] font-bold text-sm shadow-lg transition-all cursor-pointer shrink-0"
          >
            <Layers className="w-4 h-4" />
            <span>Export Complete Website Data (.XLSX)</span>
          </button>
        </div>

        {lastExported && (
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center gap-2 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>Last generated spreadsheet: <strong>{lastExported}</strong></span>
          </div>
        )}
      </div>

      {/* Date Range Filter Bar */}
      <div className="bg-white dark:bg-[#0D231D] rounded-xl border border-[#E5EAE6] dark:border-[#1B3B31] p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-[#17221F] dark:text-[#F0F5F2]">
          <Filter className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37]" />
          <span>Filter Exports by Date Range (Optional)</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6]">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-xs font-medium text-[#17221F] dark:text-[#F0F5F2] focus-glow"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6]">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-xs font-medium text-[#17221F] dark:text-[#F0F5F2] focus-glow"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-semibold text-[#17221F] dark:text-white hover:bg-slate-200 press-scale cursor-pointer"
            >
              Reset Dates
            </button>
          )}
        </div>
      </div>

      {/* Grid of Individual Module Excel Exports + Complete Website Export Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {exportItems.map((item, idx) => {
          const IconComponent = item.icon;
          return (
            <div
              key={item.id}
              className="hover-lift hover-glow bg-white dark:bg-[#0D231D] rounded-xl border border-[#E5EAE6] dark:border-[#1B3B31] p-5 flex flex-col justify-between hover:border-[#064E3B] dark:hover:border-[#D4AF37]/50 transition-all shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#064E3B]/10 dark:bg-[#D4AF37]/15 text-[#064E3B] dark:text-[#D4AF37] flex items-center justify-center shrink-0">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-bold text-[#17221F] dark:text-[#F0F5F2] tabular-nums">
                    {item.count} {item.count === 1 ? 'record' : 'records'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2]">
                  {idx + 1}. {item.title}
                </h3>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1 leading-relaxed">
                  {item.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={item.action}
                className="hover-shine press-scale mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Download .XLSX</span>
              </button>
            </div>
          );
        })}

        {/* Complete Website Data Export */}
        <div className="hover-lift hover-glow bg-[#064E3B]/5 dark:bg-[#D4AF37]/10 rounded-xl border-2 border-[#064E3B] dark:border-[#D4AF37] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#064E3B] text-[#D4AF37] flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 rounded-md bg-[#064E3B] text-white text-xs font-bold uppercase tracking-wider">
                All 16 Sheets
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2]">
              Export Complete Website Data
            </h3>
            <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1 leading-relaxed">
              Generates a single comprehensive Excel workbook containing separate worksheets for all 16 datasets above.
            </p>
          </div>

          <button
            type="button"
            onClick={downloadCompleteWebsiteWorkbook}
            className="hover-shine press-scale mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#c29d2f] text-[#071713] text-xs font-bold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Complete Workbook (.XLSX)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
