import ExcelJS from "exceljs";
import type { CohortMember } from "@/lib/types";

/** "Team 1" < "Team 2" < … < "Team 10" rather than lexicographic ("Team
 * 10" before "Team 2") — falls back to plain string comparison for team
 * names that don't end in a number. */
function naturalCompare(a: string, b: string): number {
  const pattern = /^(.*?)(\d+)?$/;
  const [, aPrefix, aNumStr] = a.match(pattern) ?? [undefined, a, undefined];
  const [, bPrefix, bNumStr] = b.match(pattern) ?? [undefined, b, undefined];
  const prefixCompare = aPrefix.trim().localeCompare(bPrefix.trim());
  if (prefixCompare !== 0) return prefixCompare;
  const aNum = aNumStr ? Number(aNumStr) : null;
  const bNum = bNumStr ? Number(bNumStr) : null;
  if (aNum != null && bNum != null) return aNum - bNum;
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return 0;
}

/** Downloads a batch's members as "<batch> <module> members.xlsx": Sr No,
 * Member name, Email, Team assigned — sorted by team, with each team's rows
 * merged into one "Team assigned" cell and shaded as a block. */
export async function exportCohortMembersExcel({
  members,
  teamNameOverrides,
  batchName,
  moduleName,
}: {
  members: CohortMember[];
  teamNameOverrides: Record<string, string>;
  batchName: string;
  moduleName?: string | null;
}) {
  const teamNameFor = (member: CohortMember) =>
    member.tag ? teamNameOverrides[member.tag.id] ?? member.tag.name : "Unassigned";

  const sortedMembers = [...members].sort((a, b) => {
    const teamCompare = naturalCompare(teamNameFor(a), teamNameFor(b));
    if (teamCompare !== 0) return teamCompare;
    return (a.fullName || "").localeCompare(b.fullName || "");
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Members");
  worksheet.columns = [
    { header: "Sr No", key: "sr", width: 8 },
    { header: "Member name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 32 },
    { header: "Team assigned", key: "team", width: 20 },
  ];
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3699FC" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  sortedMembers.forEach((member, index) => {
    worksheet.addRow({
      sr: index + 1,
      name: member.fullName || "Unnamed user",
      email: member.email || "",
      team: teamNameFor(member),
    });
  });

  // Merge consecutive rows sharing the same team into one "Team assigned"
  // cell, writing the team name once per block (row 1 is the header).
  type TeamBlock = { team: string; startRow: number; endRow: number };
  const blocks: TeamBlock[] = [];
  sortedMembers.forEach((member, index) => {
    const team = teamNameFor(member);
    const row = index + 2;
    const currentBlock = blocks[blocks.length - 1];
    if (currentBlock && currentBlock.team === team) {
      currentBlock.endRow = row;
    } else {
      blocks.push({ team, startRow: row, endRow: row });
    }
  });
  // Cycled per team block (not keyed by team name) so consecutive teams
  // always look distinct, even if two teams happen to reuse a name.
  const rowColorPalette = ["FFEAF3FF", "FFFFF3D6", "FFE8F8EE", "FFF3E8FB", "FFFFE8E8", "FFE8F7F7"];
  blocks.forEach((block, blockIndex) => {
    if (block.endRow > block.startRow) {
      worksheet.mergeCells(block.startRow, 4, block.endRow, 4);
    }
    worksheet.getCell(block.startRow, 4).alignment = { vertical: "middle", horizontal: "center" };

    const color = rowColorPalette[blockIndex % rowColorPalette.length];
    for (let row = block.startRow; row <= block.endRow; row += 1) {
      worksheet.getRow(row).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      });
    }
  });

  const fileNameBase = `${batchName}${moduleName ? ` ${moduleName}` : ""}`.replace(/[\\/:*?"<>|]+/g, "-");
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileNameBase} members.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
