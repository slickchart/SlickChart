// The Tattoo Artist Collection's cards on the Forms screen: [icon, bg, icon color, name, sub, form id].
const R=['var(--p-red-bg)','var(--p-red)'];
module.exports=[
 ['ti-clipboard-text','var(--p-blue-bg)','var(--p-blue)','Tattoo client intake','Tattoo history, health & agreement','tt-intake'],
 ['ti-pencil','var(--p-purple-bg)','var(--p-purple)','Design consultation & placement','Placement, style & spelling, signed off','tt-consult'],
 ['ti-file-description',...R,'Tattoo consent & release','Risks, permanence & release','tt-consent'],
 ['ti-test-pipe','var(--p-surf2)','var(--p-green)','Ink & skin sensitivity record','Ink, latex & adhesive screening','tt-sensitivity'],
 ['ti-camera','var(--p-surf2)','var(--p-green)','Photo & portfolio release','Their choice, every time','tt-photo'],
 ['ti-receipt','var(--accent-tint)','var(--accent-strong)','Booking & deposit policy','Deposit, ID & touch-ups','tt-policy'],
 ['ti-needle',...R,'Standard tattoo consent','Risks, design sign-off & agreement','tt-standard-consent'],
 ['ti-eraser',...R,'Cover-up & rework consent','Old tattoo, plan & agreement','tt-coverup-consent'],
 ['ti-writing',...R,'Fine line & micro tattoo consent','Aging, size choice & agreement','tt-fineline-consent'],
 ['ti-palette',...R,'Large-scale & realism consent','Multi-session plan & agreement','tt-large-consent'],
 ['ti-refresh',...R,'Touch-up consent','Changes, exclusions & agreement','tt-touchup-consent'],
 ['ti-bandage',...R,'Second-skin healing consent','Adhesive check, timeline & agreement','tt-second-skin-consent'],
];
