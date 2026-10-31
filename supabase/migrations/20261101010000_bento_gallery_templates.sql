-- Two more portfolio templates: Bento (tiles) and Gallery (a masonry wall of work).

alter table public.profiles drop constraint if exists profiles_portfolio_template_check;
alter table public.profiles add constraint profiles_portfolio_template_check
  check (portfolio_template in ('classic', 'minimal', 'showcase', 'bento', 'gallery'));
