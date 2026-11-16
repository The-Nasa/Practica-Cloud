-- Pruebas de integridad para una base aislada con 001_schema.sql instalado.
-- Ejecutar con psql -X -v ON_ERROR_STOP=1 -f 002_verificar.sql.
-- Todos los datos de prueba se revierten. No ejecutar pruebas sobre produccion.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(condition boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF condition IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'FALLO: %', message;
    END IF;
END;
$$;

CREATE FUNCTION pg_temp.assert_rejected(command text, expected_state text, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE command;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected_state THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'FALLO: %. SQLSTATE esperado %, recibido %: %', message, expected_state, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'FALLO: %; la operacion fue aceptada', message;
END;
$$;

DO $$
DECLARE
    customer uuid; courier uuid; courier2 uuid; zone uuid; store1 uuid; store2 uuid;
    category uuid; product1 uuid; product2 uuid; sku1 uuid; sku2 uuid;
    purchase1 uuid; purchase2 uuid; order1 uuid; order2 uuid; item1 uuid;
    payment1 uuid; payment2 uuid; refund1 uuid; assignment1 uuid;
    total bigint;
BEGIN
    INSERT INTO identity.users(full_name, email, phone)
        VALUES ('Cliente prueba', 'prueba-cliente@example.test', '+51900000001') RETURNING id INTO customer;
    INSERT INTO identity.users(full_name, email, phone)
        VALUES ('Repartidor prueba', 'prueba-repartidor@example.test', '+51900000002') RETURNING id INTO courier;
    INSERT INTO identity.users(full_name, email, phone)
        VALUES ('Repartidor dos', 'prueba-repartidor2@example.test', '+51900000003') RETURNING id INTO courier2;
    PERFORM pg_temp.assert_rejected(
        $cmd$INSERT INTO identity.users(full_name,email,phone) VALUES ('Otro','prueba-cliente@example.test','+51900000004')$cmd$,
        '23505', 'correo unico');
    INSERT INTO identity.user_roles VALUES (customer, 'customer', now()), (courier, 'courier', now());
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO identity.user_roles(user_id,role_code) VALUES (%L,''desconocido'')', customer),
        '23503', 'rol existente');
    INSERT INTO geography.coverage_zones(code, name, base_fee_cents, estimated_minutes)
        VALUES ('test-centro', 'Centro de prueba', 500, 20) RETURNING id INTO zone;
    INSERT INTO geography.addresses(user_id, zone_id, label, recipient_name, phone, street, street_number, is_default)
        VALUES (customer, zone, 'Casa', 'Cliente', '+51900000001', 'Calle prueba', '10', true);
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO geography.addresses(user_id,zone_id,label,recipient_name,phone,street,street_number,is_default)
         VALUES (%L,%L,''Trabajo'',''Cliente'',''+51900000001'',''Calle'',''20'',true)', customer, zone),
        '23505', 'una direccion predeterminada activa');
    INSERT INTO merchant.stores(category_code,zone_id,name,address_text,phone,status)
        VALUES ('restaurantes',zone,'Tienda uno','Calle 1','+51900000005','active') RETURNING id INTO store1;
    INSERT INTO merchant.stores(category_code,zone_id,name,address_text,phone,status)
        VALUES ('bodegas',zone,'Tienda dos','Calle 2','+51900000006','active') RETURNING id INTO store2;
    INSERT INTO catalog.categories(code,name) VALUES ('test-comida','Comida de prueba') RETURNING id INTO category;
    INSERT INTO catalog.products(store_id,category_id,name) VALUES (store1,category,'Producto uno') RETURNING id INTO product1;
    INSERT INTO catalog.products(store_id,category_id,name) VALUES (store2,category,'Producto dos') RETURNING id INTO product2;
    INSERT INTO catalog.skus(product_id,sku_code,price_cents) VALUES (product1,'TEST-SKU-1',1200) RETURNING id INTO sku1;
    INSERT INTO catalog.skus(product_id,sku_code,price_cents) VALUES (product2,'TEST-SKU-2',900) RETURNING id INTO sku2;
    INSERT INTO inventory.stock(sku_id,on_hand) VALUES (sku1,3), (sku2,2);
    PERFORM pg_temp.assert_rejected(format('UPDATE inventory.stock SET on_hand = -1 WHERE sku_id = %L', sku1),
        '23514', 'existencia fisica no negativa');

    INSERT INTO ordering.purchases(customer_id) VALUES (customer) RETURNING id INTO purchase1;
    INSERT INTO ordering.purchase_destinations(purchase_id,zone_id,recipient_name,phone,street,street_number)
        VALUES (purchase1,zone,'Cliente','+51900000001','Calle historica','10');
    INSERT INTO ordering.merchant_orders(purchase_id,store_id,delivery_fee_cents)
        VALUES (purchase1,store1,500) RETURNING id INTO order1;
    INSERT INTO ordering.order_items(merchant_order_id,sku_id,product_name_at_sale,variant_name_at_sale,unit_price_cents,quantity)
        VALUES (order1,sku1,'Producto uno','Estandar',1200,2) RETURNING id INTO item1;
    SELECT total_cents INTO total FROM ordering.purchase_totals WHERE purchase_id = purchase1;
    PERFORM pg_temp.assert_true(total = 2900, 'total calculado con lineas y envio');
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO ordering.order_items(merchant_order_id,sku_id,product_name_at_sale,variant_name_at_sale,unit_price_cents,quantity)
         VALUES (%L,%L,''Ajeno'',''Estandar'',900,1)',order1,sku2), '23514', 'SKU del mismo comercio');
    PERFORM pg_temp.assert_rejected(format('UPDATE ordering.order_items SET quantity=5 WHERE id=%L', item1),
        '23514', 'lineas historicas inmutables');
    PERFORM pg_temp.assert_rejected(format('UPDATE ordering.purchase_destinations SET street=''Otra'' WHERE purchase_id=%L',purchase1),
        '23514', 'direccion historica inmutable');
    UPDATE catalog.skus SET price_cents=1500 WHERE id=sku1;
    SELECT total_cents INTO total FROM ordering.purchase_totals WHERE purchase_id=purchase1;
    PERFORM pg_temp.assert_true(total=2900,'precio actual no cambia una venta anterior');

    INSERT INTO inventory.reservations(order_item_id) VALUES (item1);
    PERFORM pg_temp.assert_true((SELECT available=1 FROM inventory.availability WHERE sku_id=sku1), 'disponibilidad descuenta reserva');
    UPDATE inventory.reservations SET status='released',closed_at=now() WHERE order_item_id=item1;
    PERFORM pg_temp.assert_true((SELECT available=3 FROM inventory.availability WHERE sku_id=sku1), 'liberar reserva devuelve disponibilidad');
    PERFORM pg_temp.assert_rejected(format('UPDATE inventory.reservations SET status=''released'',closed_at=now() WHERE order_item_id=%L',item1),
        '23514','no liberar dos veces');
    PERFORM pg_temp.assert_rejected(format('UPDATE ordering.merchant_orders SET status_code=''delivered'' WHERE id=%L',order1),
        '23514','no saltar estados');

    INSERT INTO billing.payment_attempts(purchase_id,method_code,provider,amount_cents)
        VALUES (purchase1,'card','test-provider',2900) RETURNING id INTO payment1;
    UPDATE billing.payment_attempts SET status='succeeded',succeeded_at=now(),provider_reference='test-payment-1' WHERE id=payment1;
    PERFORM pg_temp.assert_rejected(format('UPDATE billing.payment_attempts SET status=''failed'',succeeded_at=NULL WHERE id=%L',payment1),
        '23514','pago confirmado no puede revertirse');
    INSERT INTO billing.payment_attempts(purchase_id,method_code,provider,amount_cents)
        VALUES (purchase1,'card','test-provider',2900) RETURNING id INTO payment2;
    PERFORM pg_temp.assert_rejected(format('UPDATE billing.payment_attempts SET status=''succeeded'',succeeded_at=now() WHERE id=%L',payment2),
        '23505','un cobro exitoso por compra');
    UPDATE ordering.merchant_orders SET status_code='cancelled' WHERE id=order1;
    PERFORM pg_temp.assert_true((SELECT version=1 FROM ordering.merchant_orders WHERE id=order1),'version incrementada');
    PERFORM pg_temp.assert_true((SELECT status='cancelled' FROM ordering.purchase_states WHERE purchase_id=purchase1),'estado padre calculado');
    PERFORM pg_temp.assert_rejected(format('UPDATE ordering.merchant_orders SET status_code=''confirmed'' WHERE id=%L',order1),
        '23514','estado terminal no se reabre');
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO billing.refunds(payment_attempt_id,merchant_order_id,amount_cents,request_key,reason) VALUES (%L,%L,2901,''test-over'',''Cancelacion'')',payment1,order1),
        '23514','reembolso no supera cobro');
    INSERT INTO billing.refunds(payment_attempt_id,merchant_order_id,amount_cents,request_key,reason)
        VALUES (payment1,order1,2900,'test-refund','Cancelacion') RETURNING id INTO refund1;
    UPDATE billing.refunds SET status='succeeded',succeeded_at=now() WHERE id=refund1;
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO billing.refunds(payment_attempt_id,merchant_order_id,amount_cents,request_key,reason) VALUES (%L,%L,1,''test-duplicate'',''Duplicado'')',payment1,order1),
        '23514','suma reembolsada no supera pago');

    INSERT INTO ordering.purchases(customer_id) VALUES (customer) RETURNING id INTO purchase2;
    INSERT INTO ordering.merchant_orders(purchase_id,store_id,delivery_fee_cents)
        VALUES (purchase2,store1,500) RETURNING id INTO order2;
    INSERT INTO ordering.order_items(merchant_order_id,sku_id,product_name_at_sale,variant_name_at_sale,unit_price_cents,quantity)
        VALUES (order2,sku1,'Producto uno','Estandar',1500,1);
    UPDATE ordering.merchant_orders SET status_code='confirmed' WHERE id=order2;
    UPDATE ordering.merchant_orders SET status_code='preparing' WHERE id=order2;
    UPDATE ordering.merchant_orders SET status_code='ready' WHERE id=order2;
    INSERT INTO delivery.courier_profiles(user_id,vehicle_type,plate,status,is_online)
        VALUES (courier,'motorcycle','TEST-01','active',true), (courier2,'bicycle',NULL,'active',true);
    INSERT INTO delivery.assignments(merchant_order_id,courier_user_id,agreed_fee_cents)
        VALUES (order2,courier,400) RETURNING id INTO assignment1;
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO delivery.assignments(merchant_order_id,courier_user_id,agreed_fee_cents) VALUES (%L,%L,400)',order2,courier2),
        '23505','un repartidor por entrega activa');
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO delivery.assignments(merchant_order_id,courier_user_id,agreed_fee_cents) VALUES (%L,%L,400)',order1,courier),
        '23505','una entrega activa por repartidor');
    UPDATE delivery.assignments SET status='picked_up',picked_up_at=now() WHERE id=assignment1;
    UPDATE ordering.merchant_orders SET status_code='in_transit' WHERE id=order2;
    UPDATE delivery.assignments SET status='delivered',delivered_at=now() WHERE id=assignment1;
    UPDATE ordering.merchant_orders SET status_code='delivered' WHERE id=order2;
    INSERT INTO ordering.reviews(merchant_order_id,rating) VALUES (order2,5);
    PERFORM pg_temp.assert_true((SELECT rating_count=1 AND rating_average=5 FROM merchant.ratings WHERE store_id=store1),'calificacion derivada');
    PERFORM pg_temp.assert_true((SELECT status='completed' FROM ordering.purchase_states WHERE purchase_id=purchase2),'compra entregada');

    INSERT INTO billing.webhook_receipts(provider,provider_event_id,payload) VALUES ('test-provider','event-1','{}');
    PERFORM pg_temp.assert_rejected(
        $cmd$INSERT INTO billing.webhook_receipts(provider,provider_event_id,payload) VALUES ('test-provider','event-1','{}')$cmd$,
        '23505','deduplicacion webhook');
    INSERT INTO platform.idempotency_keys(user_id,operation,key,request_hash,expires_at)
        VALUES (customer,'create-purchase','test-key','hash-prueba',now()+interval '1 day');
    PERFORM pg_temp.assert_rejected(format(
        'INSERT INTO platform.idempotency_keys(user_id,operation,key,request_hash,expires_at) VALUES (%L,''create-purchase'',''test-key'',''otro-hash'',now()+interval ''1 day'')',customer),
        '23505','unicidad idempotencia por usuario y operacion');
    RAISE NOTICE 'OK: integridad, vistas, snapshots, transiciones, reservas, cobros, reembolsos, reparto e idempotencia';
END;
$$;

ROLLBACK;
