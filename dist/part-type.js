// A hole on the selected broad face is useful evidence for a mounting tab, but cannot distinguish a gusset
// from a stringer or prove that an unpierced sheet body is not a tab.
export function detectPartType(row,face){
  if(row.category==='Tube'||row.category==='Review'||!face)return 'Review';
  return face.holes>0?'Tab':'Gusset / stringer';
}

export function partTypeEvidence(row,face){
  if(row.partTypeEdited)return 'Manually set. Verify the part identity in source CAD.';
  if(row.category==='Tube')return 'Tube stock is outside the tab and gusset check.';
  if(row.category==='Review'||!face)return 'No reliable sheet face or body classification; identify this part in CAD.';
  if(face.holes>0)return `${face.holes} internal cutout${face.holes===1?'':'s'} on the selected flat face ${face.holes===1?'suggests':'suggest'} a mounting tab.`;
  return 'No internal cutout on the selected flat face suggests a gusset or stringer. A tab without a hole is also possible.';
}
