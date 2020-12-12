create database todo;
	use todo;
    
create table todo_list(
	id int not null auto_increment,
    todo_name char(16) not null,
    due_date date not null,
    priority enum('low', 'medium', 'high') not null,
    completed enum('yes',  'no') default 'no',
    img_url text,
    primary key (id)
    );
    
create table task(
	id int not null auto_increment,
    todo_id int not null,
    name char(64) not null, 
	status enum('0', '1'), -- checkbox
    primary key (id)
);


insert into todo_list (todo_name, due_date, priority) values ("asdfsdf", "2020-12-12" , "low");

select * from  todo_list;

insert into task (todo_id, name, status) values (1, "eat", "0");
    
	