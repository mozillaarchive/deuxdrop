# 1) Create the database with the email.sql file first
# B) Replace the PASSWORD with a real password
# III) run this with `mysql -u root -p < email-grant.sql`

GRANT SELECT ON email.* to 'postfix'@'localhost' IDENTIFIED BY 'PASSWORD';
GRANT SELECT ON email.* to 'postfix'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost' IDENTIFIED BY 'PASSWORD';
GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';
