-- Pandoc Lua filter to extract hidden text from Word documents
-- and convert it to HTML comments in Markdown
--
-- Hidden text in Word (text with the "hidden" property) is extracted
-- and wrapped in HTML comment syntax so Doc Detective can parse it
-- as inline test specifications.

function Span(el)
  -- Check if the span has the 'hiddenText' class or custom style
  -- In DOCX, hidden text is typically marked with specific attributes
  if el.classes:includes('hiddenText') or 
     (el.attributes['custom-style'] and el.attributes['custom-style']:match('[Hh]idden')) then
    -- Extract the text content
    local text = pandoc.utils.stringify(el)
    -- Return as raw HTML comment
    return pandoc.RawInline('markdown', '<!-- ' .. text .. ' -->')
  end
  return el
end

-- Alternative approach: check for specific Word formatting properties
function traverse(node)
  if node.t == 'Span' then
    -- Check for hidden text formatting in the attributes
    if node.attr and node.attr[3] then
      for _, attr in ipairs(node.attr[3]) do
        if attr[1] == 'hidden' and attr[2] == 'true' then
          local text = pandoc.utils.stringify(node)
          return pandoc.RawInline('markdown', '<!-- ' .. text .. ' -->')
        end
      end
    end
  end
  return node
end

return {
  { Span = Span },
  { Pandoc = function(doc)
      return doc:walk {
        Span = traverse
      }
    end
  }
}
