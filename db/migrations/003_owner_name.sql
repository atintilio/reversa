-- Nome do proprietário criado pelo bootstrap provisório (antes: "Administrador Argus Prime").
update users set name = 'André Carlos Tintilio', updated_at = now()
 where email_normalized = 'atintilio@argusprime.com.br' and name = 'Administrador Argus Prime';
