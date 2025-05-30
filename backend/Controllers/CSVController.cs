using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.IO;
using System.Linq;
using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authentication.OAuth.Claims;

namespace CSVWizard.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CsvController : ControllerBase
    {
        [HttpPost("upload")]
        public IActionResult Upload([FromForm] IFormFile file)
        {
            if (file == null) return BadRequest("No file uploaded.");
            using var reader = new StreamReader(file.OpenReadStream());
            var content = reader.ReadToEnd();
            return Ok(new { csv = content });
        }

        [HttpPost("transform")]
        public IActionResult Transform([FromBody] TransformRequest req)
        {
            var lines = req.Csv.Split('\n').Where(l => !string.IsNullOrWhiteSpace(l)).ToList();
            if (lines.Count == 0) return BadRequest("Empty CSV.");
            var delimiter = DetectDelimiter(lines[0]);
            var headers = lines[0].Split(delimiter).Select(h => h.Trim()).ToList();
            var data = lines.Skip(1).Select(l => l.Split(delimiter).Select(s => s.TrimEnd('\r')).ToArray()).ToList();

            // Apply all requested transformations in order
            foreach (var t in req.Transformations)
            {
                switch (t.Type)
                {
                    case "normalize": headers = NormalizeColumnAction(headers, t.Column); break;
                    case "delete": (headers, data) = DeleteAction(headers, data, t.Column); break;
                    case "explode": (headers, data) = ExplodeAction(headers, data, t.Column, t.Delimiter?.FirstOrDefault() ?? delimiter); break;          
                    case "clean": (headers, data) = CleanTextAction(headers, data, t.Column); break;
                }
            }

            // Return transformed CSV as string and preview rows
            var sb = new StringBuilder();
            sb.AppendLine(string.Join(",", headers));
            foreach (var row in data)
                sb.AppendLine(string.Join(",", row));
            return Ok(new
            {
                csv = sb.ToString(),
                preview = new[] { headers.ToArray() }.Concat(data.Take(5)).ToArray()
            });
        }

        static (List<string>, List<string[]>) DeleteAction(List<string> headers, List<string[]> data, string column)
        {
            int colIdx = FindColIdx(column, headers);

            if (colIdx >= 0 && colIdx < headers.Count)
            {
                headers.RemoveAt(colIdx);

                for (int i = 0; i < data.Count; i++)
                {
                    var row = data[i];
                    if (colIdx < row.Length)
                    {
                        var newRow = row.ToList();
                        newRow.RemoveAt(colIdx);
                        data[i] = newRow.ToArray();
                    }
                }
            }
            
            return (headers, data);
        }

        static List<string> NormalizeColumnAction(List<string> headers, string column)
        {
            if (column == "all")
            {
                for (int i = 0; i < headers.Count; i++) // can't use foreach here as we modify headers
                {
                    headers[i] = headers[i].ToLower().Replace(" ", "_");
                }
            }
            else
            {
                int colIdx = FindColIdx(column, headers);
                if (colIdx >= 0) headers[colIdx] = headers[colIdx].ToLower().Replace(" ", "_");
            }
            return headers;
        }

        static (List<string>, List<string[]>) ExplodeAction(List<string> headers, List<string[]> data, string column, char delimiter)
        {
            int colidx = FindColIdx(column, headers);
            if (colidx < 0 || colidx >= headers.Count) return (headers, data);

            string baseHeader = headers[colidx];
            var newCols = new List<string>();
            int maxSplits = data.Select(r => r[colidx].Trim().Split(delimiter).Length).Max();
            foreach (int n in Enumerable.Range(1, maxSplits))
                newCols.Add($"{baseHeader}_{n}");
            headers.RemoveAt(colidx);
            headers.InsertRange(colidx, newCols);
            for (int i = 0; i < data.Count; i++)
            {
                var row = data[i];
                var parts = row.Length > colidx ? row[colidx].Trim().Split(delimiter) : new string[0];
                var expanded = new List<string>(newCols.Count);
                for (int j = 0; j < newCols.Count; j++)
                    expanded.Add(j < parts.Length ? parts[j].Trim() : "");

                var newRow = new List<string>(row);
                newRow.RemoveAt(colidx);
                newRow.InsertRange(colidx, expanded);
                data[i] = newRow.ToArray();
            }
            return (headers, data);
        }

        static (List<string>, List<string[]>) CleanTextAction(List<string> headers, List<string[]> data, string column)
        {

            int colIdx = FindColIdx(column, headers);
            if (colIdx < 0 || colIdx >= headers.Count) return (headers, data);

            for (int i = 0; i < data.Count; i++)
            {
                var row = data[i];
                if (colIdx < row.Length)
                {
                    row[colIdx] = CleanText(row[colIdx]);
                }
            }
            return (headers, data);
        }

        static string CleanText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;
            text = Regex.Replace(text, @"\s+", " ");
            text = Regex.Replace(text, @"(^[^\w\d])|([^\w\d]$)", "");
            return text.Trim();
        }
        static int FindColIdx(string col, List<string> headers)
        {
            if (int.TryParse(col, out int idx) && idx >= 0 && idx < headers.Count) return idx;
            return headers.FindIndex(h => string.Equals(h, col, StringComparison.OrdinalIgnoreCase));
        }

        static char DetectDelimiter(string line)
        {
            if (line.Contains(",")) return ',';
            if (line.Contains(";")) return ';';
            if (line.Contains("\t")) return '\t';
            return ','; // default
        }

        public class TransformRequest
        {
            public required string Csv { get; set; }
            public required List<Transformation> Transformations { get; set; }
        }
        public class Transformation
        {
            public required string Type { get; set; }
            public required string Column { get; set; }
            public string? Delimiter { get; set; }
        }
    }
}