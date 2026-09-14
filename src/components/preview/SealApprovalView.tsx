import React from 'react';
import { SealApprovalData } from '../../models/sealApproval';
import { formatDateSlash } from '../../utils/date';

interface Props {
  data: SealApprovalData;
  id?: string;
}

export const SealApprovalView: React.FC<Props> = ({ data, id = 'seal-approval-view' }) => {
  const isQianCheng = data.types.includes('簽呈');
  const isYongYin = data.types.includes('用印');
  const isJieYin = data.types.includes('借印');

  const descLines = data.description ? data.description.split('\n') : [];
  const displayLinesCount = Math.max(descLines.length, 14);
  const displayLines: string[] = [];
  for (let i = 0; i < displayLinesCount; i++) {
    displayLines.push(descLines[i] || '');
  }

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-8 max-w-[800px] mx-auto text-xs leading-normal border border-slate-300 shadow-sm print:border-none print:shadow-none font-sans"
      style={{ minHeight: '1100px' }}
    >
      {/* 頁首公司抬頭 */}
      <div className="text-center mb-1">
        <h1 className="text-2xl font-bold tracking-wider">{data.company || '昇陽開發實業股份有限公司'}</h1>
        <h2 className="text-base font-semibold tracking-widest mt-1">各項類別申請單</h2>
      </div>

      {/* 類別核取方塊 */}
      <div className="flex justify-center gap-14 py-2 mb-2 text-sm font-semibold border-y-2 border-slate-900">
        <label className="flex items-center gap-2">
          <span className="text-base">{isQianCheng ? '☑' : '☐'}</span> 簽呈
        </label>
        <label className="flex items-center gap-2">
          <span className="text-base">{isYongYin ? '☑' : '☐'}</span> 用印
        </label>
        <label className="flex items-center gap-2">
          <span className="text-base">{isJieYin ? '☑' : '☐'}</span> 借印
        </label>
      </div>

      {/* 主表格 */}
      <table className="w-full border-collapse border-2 border-slate-900 mb-3 text-xs">
        <tbody>
          {/* 主旨與申請日 */}
          <tr className="border-b border-slate-900">
            <td className="w-20 bg-slate-100 font-bold px-3 py-1.5 text-center border-r border-slate-900 tracking-wider">
              主 旨
            </td>
            <td className="px-3 py-1.5 font-medium border-r border-slate-900">
              {data.subject || ''}
            </td>
            <td className="w-20 bg-slate-100 font-bold px-3 py-1.5 text-center border-r border-slate-900">
              申請日
            </td>
            <td className="w-36 px-3 py-1.5 text-center font-mono">
              {formatDateSlash(data.applyDate)}
            </td>
          </tr>

          {/* 說明標題 */}
          <tr className="border-b border-slate-900 bg-slate-100">
            <td colSpan={4} className="font-bold px-3 py-1 text-center tracking-widest">
              說　　　　明
            </td>
          </tr>

          {/* 說明內容列 */}
          <tr>
            <td colSpan={4} className="p-0 align-top">
              <div className="divide-y divide-slate-200">
                {displayLines.map((line, idx) => (
                  <div key={idx} className="px-3 py-1 min-h-[22px] text-slate-800 whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))}
              </div>
            </td>
          </tr>

          {/* 印章借出/歸還簽收 */}
          <tr className="border-t-2 border-slate-900">
            <td colSpan={2} rowSpan={2} className="p-2 border-r border-slate-900 text-xs text-slate-400"></td>
            <td className="bg-slate-100 font-bold px-2 py-1 text-center border-r border-slate-900">
              印章借出簽收
            </td>
            <td className="px-2 py-1 text-center border-slate-900 h-7"></td>
          </tr>
          <tr className="border-t border-slate-900">
            <td className="bg-slate-100 font-bold px-2 py-1 text-center border-r border-slate-900">
              印章歸還簽收
            </td>
            <td className="px-2 py-1 text-center border-slate-900 h-7"></td>
          </tr>

          {/* 簽核欄位標題 */}
          <tr className="border-t-2 border-slate-900 text-center bg-slate-100 font-bold">
            <td className="py-1 border-r border-slate-900 w-1/4">董事長</td>
            <td className="py-1 border-r border-slate-900 w-1/4">特助</td>
            <td className="py-1 border-r border-slate-900 w-1/4">部門主管</td>
            <td className="py-1 border-slate-900 w-1/4">經辦</td>
          </tr>
          {/* 簽核空白格 */}
          <tr className="border-t border-slate-900 h-20">
            <td className="border-r border-slate-900"></td>
            <td className="border-r border-slate-900"></td>
            <td className="border-r border-slate-900"></td>
            <td className="border-slate-900"></td>
          </tr>
          <tr className="border-t border-slate-900">
            <td colSpan={3} className="border-r border-slate-900"></td>
            <td className="text-[11px] text-slate-600 py-1 text-center border-slate-900">合約正本領取簽收</td>
          </tr>
          <tr className="border-t border-slate-900 h-6">
            <td colSpan={3} className="border-r border-slate-900"></td>
            <td className="border-slate-900"></td>
          </tr>
        </tbody>
      </table>

      {/* 注意事項 */}
      <div className="text-[11px] text-slate-600 mb-3 leading-normal">
        <p className="font-bold text-slate-800">注意事項：</p>
        <p>一、簽呈取代用印申請，請同時勾選簽呈+用印，合約附件需一式兩份。</p>
        <p>二、採購簽呈需附至少三家(經辦二家,財務一家)廠商報價單，並將比價結果於簽呈上說明。</p>
      </div>

      {/* 編號區域 */}
      <table className="w-full border-collapse border border-slate-900 text-[11px] text-center">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-900 font-bold">
            <td className="p-1 border-r border-slate-900 w-1/3">財產編號(財務單位)</td>
            <td className="p-1 border-r border-slate-900 w-1/3">簽呈申請編號(歸檔單位)</td>
            <td className="p-1 w-1/3">用印申請編號(用印單位)</td>
          </tr>
        </thead>
        <tbody>
          <tr className="h-8">
            <td className="border-r border-slate-900"></td>
            <td className="border-r border-slate-900"></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
