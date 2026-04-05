import { useState, useMemo, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Search, X } from 'lucide-react';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';
import {
  type CsvData,
  type ColumnType,
  type SortDir,
  sortRows,
  filterRows,
} from './csv';

type CsvTableProps = {
  data: CsvData;
};

const TYPE_BADGES: Record<ColumnType, { label: string; className: string }> = {
  string:  { label: 'abc',  className: 'text-amber-400/70' },
  number:  { label: '#',    className: 'text-green-400/70' },
  boolean: { label: 'bool', className: 'text-blue-400/70' },
  date:    { label: 'date', className: 'text-purple-400/70' },
  null:    { label: 'null', className: 'text-muted-foreground/50' },
  mixed:   { label: 'mix',  className: 'text-orange-400/70' },
};

export function CsvTable({ data }: CsvTableProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filter, setFilter] = useState('');
  const [filterCol, setFilterCol] = useState<number | null>(null);

  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortCol === colIdx) {
        // cycle: asc → desc → none
        if (sortDir === 'asc') setSortDir('desc');
        else if (sortDir === 'desc') {
          setSortCol(null);
          setSortDir(null);
        }
      } else {
        setSortCol(colIdx);
        setSortDir('asc');
      }
    },
    [sortCol, sortDir],
  );

  const handleColumnFilter = useCallback(
    (colIdx: number) => {
      if (filterCol === colIdx) {
        setFilterCol(null);
        setFilter('');
      } else {
        setFilterCol(colIdx);
        setFilter('');
      }
    },
    [filterCol],
  );

  const processedRows = useMemo(() => {
    let rows = data.rows;

    // Global or column-specific filter
    if (filter.trim()) {
      if (filterCol !== null) {
        const lower = filter.toLowerCase();
        rows = rows.filter((row) => (row[filterCol] ?? '').toLowerCase().includes(lower));
      } else {
        rows = filterRows(rows, filter);
      }
    }

    // Sort
    if (sortCol !== null && sortDir !== null) {
      rows = sortRows(rows, sortCol, sortDir, data.columnTypes[sortCol]);
    }

    return rows;
  }, [data.rows, data.columnTypes, filter, filterCol, sortCol, sortDir]);

  if (data.headers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Search className="size-3 text-muted-foreground shrink-0" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={
            filterCol !== null
              ? `Filter "${data.headers[filterCol]}"…`
              : 'Filter all columns…'
          }
          className="h-6 text-xs border-none bg-transparent px-1 focus-visible:ring-0 focus-visible:border-none"
        />
        {(filter || filterCol !== null) && (
          <button
            onClick={() => {
              setFilter('');
              setFilterCol(null);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
        <span className="text-xs text-muted-foreground shrink-0 ml-auto font-mono tabular-nums">
          {processedRows.length.toLocaleString()}
          {processedRows.length !== data.rows.length && ` / ${data.rows.length.toLocaleString()}`}
          {' '}rows
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              {/* Row number gutter */}
              <th className="px-2 py-1.5 text-right text-muted-foreground/50 font-normal w-10 border-b border-r border-border select-none">
                #
              </th>
              {data.headers.map((header, colIdx) => {
                const badge = TYPE_BADGES[data.columnTypes[colIdx]];
                const isActiveSort = sortCol === colIdx;
                const isActiveFilter = filterCol === colIdx;

                return (
                  <th
                    key={colIdx}
                    className={cn(
                      'px-2 py-1.5 text-left font-semibold border-b border-r border-border select-none whitespace-nowrap',
                      isActiveFilter && 'bg-primary/10',
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Sort button */}
                      <button
                        onClick={() => handleSort(colIdx)}
                        className={cn(
                          'flex items-center gap-1 hover:text-primary transition-colors min-w-0',
                          isActiveSort && 'text-primary',
                        )}
                        title={`Sort by ${header}`}
                      >
                        <span className="truncate">{header}</span>
                        {isActiveSort && sortDir === 'asc' ? (
                          <ArrowUp className="size-3 shrink-0" />
                        ) : isActiveSort && sortDir === 'desc' ? (
                          <ArrowDown className="size-3 shrink-0" />
                        ) : (
                          <ArrowUpDown className="size-3 shrink-0 opacity-30" />
                        )}
                      </button>

                      {/* Type badge */}
                      <span
                        className={cn('text-[10px] shrink-0', badge.className)}
                        title={`Column type: ${data.columnTypes[colIdx]}`}
                      >
                        {badge.label}
                      </span>

                      {/* Column filter toggle */}
                      <button
                        onClick={() => handleColumnFilter(colIdx)}
                        className={cn(
                          'shrink-0 opacity-0 group-hover/th:opacity-100 hover:text-primary transition-all',
                          isActiveFilter && 'opacity-100 text-primary',
                        )}
                        title={`Filter by ${header}`}
                      >
                        <Search className="size-2.5" />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {processedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="group hover:bg-muted/30 transition-colors"
              >
                {/* Row number */}
                <td className="px-2 py-1 text-right text-muted-foreground/40 border-r border-border tabular-nums select-none">
                  {rowIdx + 1}
                </td>
                {data.headers.map((_, colIdx) => {
                  const cell = row[colIdx] ?? '';
                  const colType = data.columnTypes[colIdx];

                  return (
                    <td
                      key={colIdx}
                      className={cn(
                        'px-2 py-1 border-r border-border max-w-xs truncate',
                        cell === '' && 'text-muted-foreground/30 italic',
                        colType === 'number' && 'text-right tabular-nums',
                      )}
                      title={cell}
                    >
                      {cell === '' ? 'null' : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {processedRows.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            No rows match the filter
          </div>
        )}
      </div>
    </div>
  );
}
