alter table public.organization_settings
add column if not exists bank_short_name text check (char_length(bank_short_name) <= 40);

update public.organization_settings
set bank_short_name = case bank_code
  when 'VCB' then 'Vietcombank'
  when 'STB' then 'Sacombank'
  when 'TPB' then 'TPBank'
  when 'VPB' then 'VPBank'
  when 'ICB' then 'VietinBank'
  when 'ACB' then 'ACB'
  when 'BIDV' then 'BIDV'
  when 'MB' then 'MBBank'
  when 'OCB' then 'OCB'
  when 'KLB' then 'KienLongBank'
  when 'MSB' then 'MSB'
  else bank_short_name
end
where bank_code is not null
  and bank_short_name is null;
