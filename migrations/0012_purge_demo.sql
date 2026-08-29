-- Quita los productores de ejemplo / prueba. No toca captura real
-- (un Felipe Montoya de verdad no se borra: hace falta el teléfono de la prueba).

delete from producers
where coalesce(is_example, false) = true
   or notes ilike '%ejemplo ciclo%'
   or (
     name in (
       'Agrícola El Roble SPR de RL',
       'Ramón Payán López',
       'Productora Los Cañeros',
       'María Elena Osuna',
       'Ganadera y Agrícola Zazueta',
       'Jesús Antonio Beltrán',
       'Campo Nuevo Amanecer',
       'Socorro Inzunza',
       'Agrícola Bamoa',
       'Felipe Montoya',
       'Integradora del Valle',
       'Rosa Isela Cota'
     )
     and phone in (
       '6871234567',
       '6689988776',
       '6874455122',
       '6981122334',
       '6683344556',
       '6877788990',
       '6872211009',
       '6735566778',
       '6876677889',
       '6682233445',
       '6731122334',
       '6873344556'
     )
   );

delete from producer_groups g
where not exists (select 1 from producers p where p.group_id = g.id);
